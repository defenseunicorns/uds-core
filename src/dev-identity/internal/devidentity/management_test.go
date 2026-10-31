// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package devidentity

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"

	api "github.com/dexidp/dex/api/v2"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/fake"
)

type testDex struct {
	mu      sync.Mutex
	clients map[string]*api.Client
	lists   int
	updates int
}

func newTestDex() *testDex { return &testDex{clients: map[string]*api.Client{}} }
func (d *testDex) ListClients(_ context.Context, _ *api.ListClientReq, _ ...grpc.CallOption) (*api.ListClientResp, error) {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.lists++
	result := &api.ListClientResp{}
	for _, client := range d.clients {
		result.Clients = append(result.Clients, &api.ClientInfo{Id: client.Id, Public: client.Public, Name: client.Name, RedirectUris: client.RedirectUris, TrustedPeers: client.TrustedPeers})
	}
	return result, nil
}
func (d *testDex) GetClient(_ context.Context, req *api.GetClientReq, _ ...grpc.CallOption) (*api.GetClientResp, error) {
	d.mu.Lock()
	defer d.mu.Unlock()
	client, ok := d.clients[req.Id]
	if !ok {
		return nil, status.Error(codes.Unknown, "not found")
	}
	return &api.GetClientResp{Client: client}, nil
}
func (d *testDex) CreateClient(_ context.Context, req *api.CreateClientReq, _ ...grpc.CallOption) (*api.CreateClientResp, error) {
	d.mu.Lock()
	defer d.mu.Unlock()
	if _, exists := d.clients[req.Client.Id]; exists {
		return &api.CreateClientResp{AlreadyExists: true}, nil
	}
	d.clients[req.Client.Id] = req.Client
	return &api.CreateClientResp{Client: req.Client}, nil
}
func (d *testDex) UpdateClient(_ context.Context, req *api.UpdateClientReq, _ ...grpc.CallOption) (*api.UpdateClientResp, error) {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.updates++
	client, exists := d.clients[req.Id]
	if !exists {
		return &api.UpdateClientResp{NotFound: true}, nil
	}
	// Match the real API after protobuf transport drops empty repeated fields.
	if req.Name != "" {
		client.Name = req.Name
	}
	if len(req.RedirectUris) > 0 {
		client.RedirectUris = req.RedirectUris
	}
	if len(req.TrustedPeers) > 0 {
		client.TrustedPeers = req.TrustedPeers
	}
	return &api.UpdateClientResp{}, nil
}

type countedState struct {
	StateStore
	lists, configWrites, writes int
}

func (s *countedState) Put(ctx context.Context, kind, key string, value any) error {
	s.writes++
	if kind == "config" {
		s.configWrites++
	}
	return s.StateStore.Put(ctx, kind, key, value)
}

func (s *countedState) List(ctx context.Context, kind string) ([][]byte, error) {
	if kind == "client" {
		s.lists++
	}
	return s.StateStore.List(ctx, kind)
}

func TestClientRestoreUsesOnePinnedSnapshotAndAvoidsUnchangedWrites(t *testing.T) {
	store := &countedState{StateStore: NewMemoryState()}
	public, admin := newTestDex(), newTestDex()
	clients := NewReplicatedClients(store, public, admin)
	for index := 0; index < 20; index++ {
		record := ClientRecord{Realm: "uds", Data: map[string]any{"id": fmt.Sprint(index), "clientId": fmt.Sprintf("app-%d", index), "enabled": true, "publicClient": false, "secret": "actual-secret"}}
		if err := store.Put(t.Context(), "client", "uds/"+record.ID(), record); err != nil {
			t.Fatal(err)
		}
	}
	if err := clients.Restore(t.Context()); err != nil {
		t.Fatal(err)
	}
	store.lists, store.configWrites, public.lists, admin.lists = 0, 0, 0, 0
	if err := clients.Restore(t.Context()); err != nil {
		t.Fatal(err)
	}
	if store.lists != 1 || public.lists != 2 || admin.lists != 2 {
		t.Fatalf("restore repeated authority lists: state=%d public=%d admin=%d", store.lists, public.lists, admin.lists)
	}
	if public.updates != 0 || admin.updates != 0 {
		t.Fatal("unchanged restore authored Dex writes")
	}
	if store.configWrites != 0 {
		t.Fatal("unchanged restore authored publication fence writes")
	}
}
func (d *testDex) DeleteClient(_ context.Context, req *api.DeleteClientReq, _ ...grpc.CallOption) (*api.DeleteClientResp, error) {
	d.mu.Lock()
	defer d.mu.Unlock()
	_, exists := d.clients[req.Id]
	delete(d.clients, req.Id)
	return &api.DeleteClientResp{NotFound: !exists}, nil
}

func managementFixture(t *testing.T) (*Management, *fake.Clientset, *testDex, *testDex) {
	t.Helper()
	client := fake.NewSimpleClientset(&corev1.Secret{ObjectMeta: metav1.ObjectMeta{Name: "keycloak-admin-password", Namespace: "identity"}, Data: map[string][]byte{"username": []byte("admin"), "password": []byte("real-admin-password")}}, &corev1.Secret{ObjectMeta: metav1.ObjectMeta{Name: "keycloak-client-secrets", Namespace: "identity"}, Data: map[string][]byte{"uds-operator": []byte("real-operator-secret")}})
	directory, store := NewKubeDirectory(client.CoreV1().Secrets("identity")), NewKubeState(client.CoreV1().Secrets("identity"))
	public, admin := newTestDex(), newTestDex()
	management := NewManagement(directory, store, NewReplicatedClients(store, public, admin), NewScopedPersistentSessions(store, "sso.example.test"), &KubeAuthority{Core: client.CoreV1(), Auth: client.AuthenticationV1(), Namespace: "identity"}, "sso.example.test", "keycloak.admin.example.test")
	if err := management.SeedGroup(t.Context(), "uds", "/UDS Core/Admin"); err != nil {
		t.Fatal(err)
	}
	return management, client, public, admin
}

func managementRequest(m *Management, method, path, token string, body any) *httptest.ResponseRecorder {
	raw, _ := json.Marshal(body)
	request := httptest.NewRequest(method, "http://identity.internal"+path, bytes.NewReader(raw))
	request.Header.Set("Authorization", "Bearer "+token)
	writer := httptest.NewRecorder()
	if !m.ServeHTTP(writer, request) {
		writer.WriteHeader(404)
	}
	return writer
}

func adminToken(t *testing.T, m *Management, username, password string) (string, int) {
	t.Helper()
	form := url.Values{"client_id": {"admin-cli"}, "grant_type": {"password"}, "username": {username}, "password": {password}}
	request := httptest.NewRequest("POST", "http://identity.internal/realms/master/protocol/openid-connect/token", strings.NewReader(form.Encode()))
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	response := httptest.NewRecorder()
	m.ServeHTTP(response, request)
	var value struct {
		AccessToken string `json:"access_token"`
	}
	_ = json.Unmarshal(response.Body.Bytes(), &value)
	return value.AccessToken, response.Code
}

func TestManagementCredentialsRotateAndTokensSurviveRestart(t *testing.T) {
	m, client, public, admin := managementFixture(t)
	if token, code := adminToken(t, m, "admin", "wrong"); code != 401 || token != "" {
		t.Fatal("wrong credentials accepted")
	}
	token, code := adminToken(t, m, "admin", "real-admin-password")
	if code != 200 {
		t.Fatal(code)
	}
	store := NewKubeState(client.CoreV1().Secrets("identity"))
	replacement := NewManagement(NewKubeDirectory(client.CoreV1().Secrets("identity")), store, NewReplicatedClients(store, public, admin), NewPersistentSessions(store), m.Authority, m.PublicHost, m.AdminHost)
	if response := managementRequest(replacement, "GET", "/admin/realms/uds/clients", token, nil); response.Code != 200 {
		t.Fatal("restart lost authorized API token", response.Code)
	}
	secret, _ := client.CoreV1().Secrets("identity").Get(t.Context(), "keycloak-admin-password", metav1.GetOptions{})
	secret.Data["password"] = []byte("replacement-password")
	_, _ = client.CoreV1().Secrets("identity").Update(t.Context(), secret, metav1.UpdateOptions{})
	if response := managementRequest(replacement, "GET", "/admin/realms/uds/clients", token, nil); response.Code != 401 {
		t.Fatal("credential rotation did not revoke token")
	}
}

func TestClientManagementPersistsCompleteRepresentationAndRealDexFields(t *testing.T) {
	m, _, public, admin := managementFixture(t)
	token, _ := adminToken(t, m, "admin", "real-admin-password")
	data := map[string]any{"clientId": "app", "publicClient": false, "enabled": true, "redirectUris": []string{"https://app.example.test/callback"}, "attributes": map[string]string{"uds.core.groups": "[\"/UDS Core/Admin\"]"}, "protocolMappers": []map[string]any{{"protocolMapper": "oidc-audience-mapper", "config": map[string]string{"included.client.audience": "target-app", "access.token.claim": "true"}}}, "serviceAccountsEnabled": true}
	response := managementRequest(m, "POST", "/admin/realms/uds/clients", token, data)
	if response.Code != 201 {
		t.Fatal(response.Code, response.Body.String())
	}
	client, err := m.Clients.Find(t.Context(), "uds", "app")
	if err != nil || client.Secret() == "" {
		t.Fatal("client/secret missing", err)
	}
	for _, dex := range []*testDex{public, admin} {
		actual, err := dex.GetClient(t.Context(), &api.GetClientReq{Id: "app"})
		if err != nil || actual.Client.Secret != client.Secret() {
			t.Fatal("issuer client mismatch", err)
		}
	}
	response = managementRequest(m, "GET", "/admin/realms/uds/clients?clientId=app", token, nil)
	if response.Code != 200 || !strings.Contains(response.Body.String(), "uds.core.groups") || !strings.Contains(response.Body.String(), "oidc-audience-mapper") {
		t.Fatal("management representation was truncated")
	}
	response = managementRequest(m, "PUT", "/admin/realms/uds/clients/"+client.ID(), token, map[string]any{"enabled": false})
	if response.Code != 204 {
		t.Fatal(response.Code)
	}
	for _, dex := range []*testDex{public, admin} {
		if _, err := dex.GetClient(t.Context(), &api.GetClientReq{Id: "app"}); status.Code(err) != codes.Unknown {
			t.Fatal("disabled client remained authorized in Dex")
		}
	}
}

func TestUserCRUDGroupsPasswordsAndDisableRevokePersistentSessions(t *testing.T) {
	m, client, _, _ := managementFixture(t)
	token, _ := adminToken(t, m, "admin", "real-admin-password")
	response := managementRequest(m, "POST", "/admin/realms/uds/users", token, map[string]any{"username": "new-user", "email": "user@example.test", "enabled": true})
	if response.Code != 201 {
		t.Fatal(response.Code)
	}
	userID := response.Header().Get("Location")
	userID = userID[strings.LastIndex(userID, "/")+1:]
	response = managementRequest(m, "PUT", "/admin/realms/uds/users/"+userID+"/reset-password", token, map[string]any{"type": "password", "value": "real-password", "temporary": false})
	if response.Code != 204 {
		t.Fatal(response.Code, response.Body.String())
	}
	group := managementRequest(m, "GET", "/admin/realms/uds/group-by-path/%2FUDS%20Core%2FAdmin", token, nil)
	var g Group
	_ = json.Unmarshal(group.Body.Bytes(), &g)
	response = managementRequest(m, "PUT", "/admin/realms/uds/users/"+userID+"/groups/"+g.ID, token, nil)
	if response.Code != 204 {
		t.Fatal(response.Code, response.Body.String())
	}
	user, err := NewKubeDirectory(client.CoreV1().Secrets("identity")).Authenticate(t.Context(), "new-user", "real-password")
	if err != nil || len(user.Groups) != 1 || user.Groups[0] != "/UDS Core/Admin" {
		t.Fatal("persistent credentials/groups missing", err)
	}
	session, err := m.Sessions.CreateIdentity(t.Context(), user)
	if err != nil {
		t.Fatal(err)
	}
	restarted := NewScopedPersistentSessions(NewKubeState(client.CoreV1().Secrets("identity")), m.PublicHost)
	if _, ok := restarted.LookupContext(t.Context(), session); !ok {
		t.Fatal("restart lost authenticated browser session")
	}
	otherIssuer := NewScopedPersistentSessions(NewKubeState(client.CoreV1().Secrets("identity")), m.AdminHost)
	if _, ok := otherIssuer.LookupContext(t.Context(), session); ok {
		t.Fatal("session crossed issuer boundary")
	}
	response = managementRequest(m, "PUT", "/admin/realms/uds/users/"+userID, token, map[string]bool{"enabled": false})
	if response.Code != 204 {
		t.Fatal(response.Code)
	}
	if _, err := m.Directory.Authenticate(t.Context(), "new-user", "real-password"); err == nil {
		t.Fatal("disabled user authenticated")
	}
	if _, ok := restarted.LookupContext(t.Context(), session); ok {
		t.Fatal("disabled user retained browser session")
	}
}

func TestFleetCannotRenameOrDeleteUnownedClients(t *testing.T) {
	for _, item := range []struct {
		role, id string
		want     bool
	}{{"fleet", "fleet-owned", true}, {"fleet", "ordinary", false}, {"fleet", "account", false}, {"operator", "account", false}, {"operator", "ordinary", true}, {"admin", "account", true}} {
		t.Run(fmt.Sprintf("%s-%s", item.role, item.id), func(t *testing.T) {
			if clientPermitted(Principal{Role: item.role}, ClientRecord{Realm: "uds", Data: map[string]any{"clientId": item.id}}) != item.want {
				t.Fatal("ownership boundary failed")
			}
		})
	}
}
