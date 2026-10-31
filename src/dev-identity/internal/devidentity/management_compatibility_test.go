// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package devidentity

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	api "github.com/dexidp/dex/api/v2"
	authv1 "k8s.io/api/authentication/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	k8stesting "k8s.io/client-go/testing"
)

func TestFleetProjectedAssertionEnforcesCurrentCoreHTTPContract(t *testing.T) {
	m, client, public, admin := managementFixture(t)
	adminBearer, _ := adminToken(t, m, "admin", "real-admin-password")
	if r := managementRequest(m, "POST", "/admin/realms/uds/clients", adminBearer, map[string]any{"clientId": "account", "publicClient": true}); r.Code != 201 {
		t.Fatal("account fixture failed", r.Code)
	}
	authority := m.Authority.(*KubeAuthority)
	authority.FleetClientEnabled = true
	authority.FleetAudience = "http://keycloak-http.keycloak.svc.cluster.local/realms/uds"
	authority.FleetNamespace, authority.FleetServiceAccount = "uds-fleet-command", "uds-fleet-command-sa"
	_, _ = client.CoreV1().ServiceAccounts(authority.FleetNamespace).Create(t.Context(), &corev1.ServiceAccount{ObjectMeta: metav1.ObjectMeta{Name: authority.FleetServiceAccount, UID: "fleet-sa-uid"}}, metav1.CreateOptions{})
	_, _ = client.CoreV1().Pods(authority.FleetNamespace).Create(t.Context(), &corev1.Pod{ObjectMeta: metav1.ObjectMeta{Name: "fleet-admin-vitest", UID: "fleet-pod-uid"}}, metav1.CreateOptions{})
	client.PrependReactor("create", "tokenreviews", func(action k8stesting.Action) (bool, runtime.Object, error) {
		review := action.(k8stesting.CreateAction).GetObject().(*authv1.TokenReview)
		if review.Spec.Token != "projected-bound-assertion" || len(review.Spec.Audiences) != 1 || review.Spec.Audiences[0] != authority.FleetAudience {
			t.Fatal("Core Fleet audience changed")
		}
		return true, &authv1.TokenReview{Status: authv1.TokenReviewStatus{Authenticated: true, Audiences: []string{authority.FleetAudience}, User: authv1.UserInfo{Username: "system:serviceaccount:uds-fleet-command:uds-fleet-command-sa", UID: "fleet-sa-uid", Extra: map[string]authv1.ExtraValue{"authentication.kubernetes.io/pod-name": {"fleet-admin-vitest"}, "authentication.kubernetes.io/pod-uid": {"fleet-pod-uid"}}}}}, nil
	})
	form := url.Values{"grant_type": {"client_credentials"}, "client_assertion_type": {"urn:ietf:params:oauth:client-assertion-type:jwt-bearer"}, "client_assertion": {"projected-bound-assertion"}}
	request := httptest.NewRequest("POST", "http://keycloak-http.keycloak.svc.cluster.local:8080/realms/uds/protocol/openid-connect/token", strings.NewReader(form.Encode()))
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	response := httptest.NewRecorder()
	m.ServeHTTP(response, request)
	var token struct {
		Access string `json:"access_token"`
	}
	if response.Code != 200 || json.Unmarshal(response.Body.Bytes(), &token) != nil || token.Access == "" {
		t.Fatal("Fleet exchange failed", response.Code)
	}
	authority.FleetClientEnabled = false
	if r := managementRequest(m, "GET", "/admin/realms/uds/clients", token.Access, nil); r.Code != 401 {
		t.Fatal("disabled Fleet retained its persisted management bearer", r.Code)
	}
	authority.FleetClientEnabled = true
	created := managementRequest(m, "POST", "/admin/realms/uds/clients", token.Access, map[string]any{"clientId": "fleet-owned", "publicClient": true, "protocol": "openid-connect", "redirectUris": []string{"https://fleet-owned.uds.dev/callback"}})
	if created.Code != 201 {
		t.Fatal("Fleet create failed", created.Code)
	}
	owned, err := m.Clients.Find(t.Context(), "uds", "fleet-owned")
	if err != nil {
		t.Fatal(err)
	}
	for _, dex := range []*testDex{public, admin} {
		if _, err := dex.GetClient(t.Context(), &api.GetClientReq{Id: owned.ClientID()}); err != nil {
			t.Fatal("Fleet create did not reach an issuer", err)
		}
	}
	if r := managementRequest(m, "PUT", "/admin/realms/uds/clients/"+owned.ID(), token.Access, map[string]any{"clientId": "outside-prefix"}); r.Code != 403 {
		t.Fatal("Fleet renamed outside its prefix", r.Code)
	}
	if saved, err := m.Clients.Find(t.Context(), "uds", "fleet-owned"); err != nil || saved.ID() != owned.ID() {
		t.Fatal("denied rename changed persistent identity")
	}
	if r := managementRequest(m, "POST", "/admin/realms/uds/clients", token.Access, map[string]any{"clientId": "outside-prefix"}); r.Code != 403 {
		t.Fatal("Fleet created an unowned client", r.Code)
	}
	account, _ := m.Clients.Find(t.Context(), "uds", "account")
	if r := managementRequest(m, "GET", "/admin/realms/uds/clients?clientId=account", token.Access, nil); r.Code != 200 || !strings.Contains(r.Body.String(), account.ID()) {
		t.Fatal("Fleet could not read builtin client metadata", r.Code)
	}
	if r := managementRequest(m, "DELETE", "/admin/realms/uds/clients/"+account.ID(), token.Access, nil); r.Code != 403 {
		t.Fatal("Fleet deleted the builtin account client", r.Code)
	}
	if r := managementRequest(m, "GET", "/admin/realms/master/users", token.Access, nil); r.Code != 403 {
		t.Fatal("Fleet obtained master authority", r.Code)
	}
	if r := managementRequest(m, "DELETE", "/admin/realms/uds/clients/"+owned.ID(), token.Access, nil); r.Code != 204 {
		t.Fatal("Fleet could not delete its own client", r.Code)
	}
	if err := client.CoreV1().Pods(authority.FleetNamespace).Delete(t.Context(), "fleet-admin-vitest", metav1.DeleteOptions{}); err != nil {
		t.Fatal(err)
	}
	if r := managementRequest(m, "GET", "/admin/realms/uds/clients", token.Access, nil); r.Code != 401 {
		t.Fatal("deleted bound Pod retained API authority", r.Code)
	}
}

func TestNotificationFixturesEmitRealRealmUserAndAdminGroupEvents(t *testing.T) {
	m, _, public, admin := managementFixture(t)
	var audit bytes.Buffer
	m.Audit = &audit
	token, _ := adminToken(t, m, "admin", "real-admin-password")
	for _, realm := range []string{"uds", "master"} {
		base := "/admin/realms/" + realm
		if r := managementRequest(m, "POST", base+"/clients", token, map[string]any{"clientId": "notifications-client", "enabled": true, "protocol": "openid-connect", "publicClient": true, "redirectUris": []string{"*"}}); r.Code != 201 {
			t.Fatal("notification client fixture failed", realm, r.Code)
		}
		created := managementRequest(m, "POST", base+"/users", token, map[string]any{"username": "notifications-user", "enabled": true})
		if created.Code != 201 {
			t.Fatal("notification user fixture failed", realm, created.Code)
		}
		if realm == "uds" {
			group := managementRequest(m, "GET", base+"/group-by-path/%2FUDS%20Core%2FAdmin", token, nil)
			var resolved Group
			if group.Code != 200 || json.Unmarshal(group.Body.Bytes(), &resolved) != nil || resolved.ID == "" {
				t.Fatal("admin group fixture failed")
			}
			if r := managementRequest(m, "PUT", created.Header().Get("Location")+"/groups/"+resolved.ID, token, nil); r.Code != 204 {
				t.Fatal("admin membership fixture failed", r.Code)
			}
		}
	}
	for _, dex := range []*testDex{public, admin} {
		for _, id := range []string{"notifications-client", "master:notifications-client"} {
			if _, err := dex.GetClient(t.Context(), &api.GetClientReq{Id: id}); err != nil {
				t.Fatal("realm-scoped client was not stored in Dex", err)
			}
		}
	}
	decoder := json.NewDecoder(&audit)
	counts := map[string]int{}
	for {
		var event struct {
			Logger, Type, Resource, Realm string
			Representation                json.RawMessage
		}
		var raw map[string]json.RawMessage
		if err := decoder.Decode(&raw); err == io.EOF {
			break
		} else if err != nil {
			t.Fatal(err)
		}
		_ = json.Unmarshal(raw["loggerName"], &event.Logger)
		_ = json.Unmarshal(raw["eventType"], &event.Type)
		_ = json.Unmarshal(raw["resourceType"], &event.Resource)
		_ = json.Unmarshal(raw["realmName"], &event.Realm)
		event.Representation = raw["representation"]
		if event.Logger != "uds.keycloak.plugin.eventListeners.JSONLogEventListenerProvider" || event.Type != "ADMIN" {
			t.Fatal("existing Loki filters cannot read the real mutation event")
		}
		counts[event.Realm+":"+event.Resource]++
		if event.Resource == "GROUP_MEMBERSHIP" && !bytes.Contains(event.Representation, []byte("/UDS Core/Admin")) {
			t.Fatal("system administrator notification lost its group path")
		}
	}
	for _, key := range []string{"uds:CLIENT", "master:CLIENT", "uds:USER", "master:USER", "uds:GROUP_MEMBERSHIP"} {
		if counts[key] != 1 {
			t.Fatal("notification fixture did not generate its real realm mutation", key, counts[key])
		}
	}
}
