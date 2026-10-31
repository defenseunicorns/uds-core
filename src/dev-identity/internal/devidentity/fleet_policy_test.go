// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package devidentity

import (
	"encoding/json"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	authv1 "k8s.io/api/authentication/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	k8stesting "k8s.io/client-go/testing"
)

func fleetToggleFixture(t *testing.T) (*Management, *KubeAuthority) {
	t.Helper()
	m, client, _, _ := managementFixture(t)
	authority := m.Authority.(*KubeAuthority)
	authority.FleetAudience = "http://keycloak-http.keycloak.svc.cluster.local/realms/uds"
	authority.FleetNamespace, authority.FleetServiceAccount = "fleet", "fleet"
	_, _ = client.CoreV1().ServiceAccounts("fleet").Create(t.Context(), &corev1.ServiceAccount{ObjectMeta: metav1.ObjectMeta{Name: "fleet", UID: "fleet-sa"}}, metav1.CreateOptions{})
	_, _ = client.CoreV1().Pods("fleet").Create(t.Context(), &corev1.Pod{ObjectMeta: metav1.ObjectMeta{Name: "fleet-pod", UID: "fleet-pod"}}, metav1.CreateOptions{})
	client.PrependReactor("create", "tokenreviews", func(action k8stesting.Action) (bool, runtime.Object, error) {
		review := action.(k8stesting.CreateAction).GetObject().(*authv1.TokenReview)
		if review.Spec.Token != "bound-fleet-assertion" || len(review.Spec.Audiences) != 1 || review.Spec.Audiences[0] != authority.FleetAudience {
			t.Fatal("feature toggle changed reviewed credential authority")
		}
		return true, &authv1.TokenReview{Status: authv1.TokenReviewStatus{Authenticated: true, Audiences: []string{authority.FleetAudience}, User: authv1.UserInfo{Username: "system:serviceaccount:fleet:fleet", UID: "fleet-sa", Extra: map[string]authv1.ExtraValue{"authentication.kubernetes.io/pod-name": {"fleet-pod"}, "authentication.kubernetes.io/pod-uid": {"fleet-pod"}}}}}, nil
	})
	return m, authority
}

func fleetExchange(m *Management) *httptest.ResponseRecorder {
	form := url.Values{"grant_type": {"client_credentials"}, "client_assertion_type": {"urn:ietf:params:oauth:client-assertion-type:jwt-bearer"}, "client_assertion": {"bound-fleet-assertion"}}
	request := httptest.NewRequest("POST", "http://keycloak-http.keycloak.svc.cluster.local:8080/realms/uds/protocol/openid-connect/token", strings.NewReader(form.Encode()))
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	response := httptest.NewRecorder()
	m.ServeHTTP(response, request)
	return response
}

func TestFleetOptInRejectsDisabledExchangeAndRevokesWithoutRevivingOldBearer(t *testing.T) {
	m, authority := fleetToggleFixture(t)
	if response := fleetExchange(m); response.Code != 401 {
		t.Fatal("default-false Fleet exchange was authorized", response.Code)
	}
	authority.FleetClientEnabled = true
	response := fleetExchange(m)
	var body struct {
		Access string `json:"access_token"`
	}
	if response.Code != 200 || json.Unmarshal(response.Body.Bytes(), &body) != nil || body.Access == "" {
		t.Fatal("explicit opt-in did not authorize the exact bound identity", response.Code)
	}
	admin, _ := adminToken(t, m, "admin", "real-admin-password")
	authority.FleetClientEnabled = false
	if response := fleetExchange(m); response.Code != 401 {
		t.Fatal("disabled Fleet accepted another exchange", response.Code)
	}
	if response := managementRequest(m, "GET", "/admin/realms/uds/clients", body.Access, nil); response.Code != 401 {
		t.Fatal("disabled Fleet bearer remained authorized", response.Code)
	}
	if err := RevokeDisabledFleetTokens(t.Context(), m.Store, false); err != nil {
		t.Fatal(err)
	}
	// Simulate configuration restart/re-enable while preserving the actual state.
	authority.FleetClientEnabled = true
	if response := managementRequest(m, "GET", "/admin/realms/uds/clients", body.Access, nil); response.Code != 401 {
		t.Fatal("configuration restart revived a revoked Fleet bearer", response.Code)
	}
	if response := managementRequest(m, "GET", "/admin/realms/uds/clients", admin, nil); response.Code != 200 {
		t.Fatal("Fleet-only revocation removed administrator authority", response.Code)
	}
	if response := fleetExchange(m); response.Code != 200 {
		t.Fatal("re-enabled current bound identity could not obtain a fresh grant", response.Code)
	}
}
