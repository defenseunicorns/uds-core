// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package dependencies

import (
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/config"
	corev1 "k8s.io/api/core/v1"
	discoveryv1 "k8s.io/api/discovery/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"reflect"
	"testing"
)

func TestDiscoveryRebuildsAddressSetsAndSupportsIPv6(t *testing.T) {
	node := &corev1.Node{Status: corev1.NodeStatus{Addresses: []corev1.NodeAddress{{Type: corev1.NodeInternalIP, Address: "10.0.0.1"}, {Type: corev1.NodeInternalIP, Address: "2001:db8::1"}, {Type: corev1.NodeExternalIP, Address: "203.0.113.1"}}}}
	if got := NodeCIDRs([]interface{}{node}); !reflect.DeepEqual(got, []string{"10.0.0.1/32", "2001:db8::1/128"}) {
		t.Fatalf("unexpected node targets: %v", got)
	}
	slice := &discoveryv1.EndpointSlice{ObjectMeta: metav1.ObjectMeta{Name: "kubernetes-a", Namespace: "default", Labels: map[string]string{discoveryv1.LabelServiceName: "kubernetes"}}, Endpoints: []discoveryv1.Endpoint{{Addresses: []string{"10.0.0.1", "10.0.0.1"}}}}
	if got := EndpointCIDRs([]interface{}{slice}); !reflect.DeepEqual(got, []string{"10.0.0.1/32"}) {
		t.Fatal(got)
	}
	cfg := config.Config{KubeApiCIDR: "192.0.2.0/24", DiscoveredAPICIDRs: []string{"10.0.0.1/32"}, APIServiceCIDRs: []string{"10.43.0.1/32"}}
	if got := cfg.APICIDRs(); !reflect.DeepEqual(got, []string{"10.43.0.1/32", "192.0.2.0/24"}) {
		t.Fatal(got)
	}
	cfg.KubeApiCIDR = ""
	if got := cfg.APICIDRs(); !reflect.DeepEqual(got, []string{"10.0.0.1/32", "10.43.0.1/32"}) {
		t.Fatal("override removal did not restore discovery")
	}
	if got := NodeCIDRs(nil); len(got) != 0 {
		t.Fatal("deleted node remained cached")
	}
}
func TestOperatorSecretDeletionRevokesPublicClientFlag(t *testing.T) {
	cfg := config.Config{}
	LoadOperatorSecret(&cfg, &corev1.Secret{Data: map[string][]byte{"ALLOW_PUBLIC_CLIENTS": []byte("true"), "AUTHSERVICE_REDIS_URI": []byte("redis://cache"), "KEYCLOAK_CLIENT_MODE": []byte("SIGNED_JWT")}})
	if !cfg.AllowPublicClients || cfg.KeycloakClientMode != "SIGNED_JWT" {
		t.Fatal("operator config was not loaded")
	}
	LoadOperatorSecret(&cfg, nil)
	if cfg.AllowPublicClients || cfg.AuthserviceRedisUri != "" || cfg.KeycloakClientMode != "CLIENT_SECRET" {
		t.Fatal("deleted secret retained stale privileges")
	}
}
func TestStatusAndManagedFieldsUpdatesDoNotCauseWorkloadDrift(t *testing.T) {
	old := &corev1.Pod{ObjectMeta: metav1.ObjectMeta{ResourceVersion: "1"}}
	next := old.DeepCopy()
	next.ResourceVersion = "2"
	next.Status.Phase = corev1.PodRunning
	if relevantChange(old, next) {
		t.Fatal("status-only Pod change triggered Package reconcile")
	}
	next.Labels = map[string]string{"app": "changed"}
	if !relevantChange(old, next) {
		t.Fatal("Pod label drift ignored")
	}
}

func TestMissingOrInvalidOperatorModeUsesClientSecret(t *testing.T) {
	for _, mode := range []string{"", "unknown"} {
		t.Run(mode, func(t *testing.T) {
			cfg := config.Config{KeycloakClientMode: "SIGNED_JWT"}
			LoadOperatorSecret(&cfg, &corev1.Secret{Data: map[string][]byte{"KEYCLOAK_CLIENT_MODE": []byte(mode)}})
			if cfg.KeycloakClientMode != "CLIENT_SECRET" {
				t.Fatal("missing/invalid configuration retained assertion authentication")
			}
		})
	}
}
