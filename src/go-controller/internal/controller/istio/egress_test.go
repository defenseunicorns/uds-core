// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package istio

import (
	"context"
	udstypes "github.com/defenseunicorns/uds-core/src/go-controller/api/uds/v1alpha1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	dynamicfake "k8s.io/client-go/dynamic/fake"
	"k8s.io/utils/ptr"
	"reflect"
	"testing"
)

func TestHostPortsHonorHTTPDefaultsAndPluralPrecedence(t *testing.T) {
	pkg := &udstypes.UDSPackage{Spec: udstypes.Spec{Network: &udstypes.Network{Allow: []udstypes.Allow{{Direction: udstypes.Egress, RemoteHost: ptr.To("example.com"), RemoteProtocol: ptr.To(udstypes.HTTP)}}}}}
	hosts, err := hostMapFor(pkg)
	if err != nil || hosts["example.com"][0].Port != 80 {
		t.Fatal("HTTP default was not 80", err)
	}
	pkg.Spec.Network.Allow[0].Port = ptr.To(float64(443))
	pkg.Spec.Network.Allow[0].Ports = []float64{8080, 8080, 8000}
	hosts, err = hostMapFor(pkg)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(hosts["example.com"], []hostPortProtocol{{"example.com", 8000, "HTTP"}, {"example.com", 8080, "HTTP"}}) {
		t.Fatal("plural port precedence/dedup lost", hosts)
	}
	pkg.Spec.Network.Allow = append(pkg.Spec.Network.Allow, udstypes.Allow{Direction: udstypes.Egress, RemoteHost: ptr.To("example.com"), RemoteProtocol: ptr.To(udstypes.TLS), Port: ptr.To(float64(8080))})
	if _, err := hostMapFor(pkg); err == nil {
		t.Fatal("same host/port accepted conflicting protocols")
	}
}
func TestAmbientPortIdentitiesStaySeparateAndTargetServiceEntry(t *testing.T) {
	policy := buildAmbientEgressAuthorizationPolicy("example.com", &ambientHostData{portIdentities: map[int32]*portIdentity{80: {namespaces: []string{"http-app"}}, 443: {saPrincipals: []string{"cluster.local/ns/https-app/sa/client"}}}})
	rules, _, _ := unstructured.NestedSlice(policy.Object, "spec", "rules")
	if len(rules) != 2 {
		t.Fatal("port scopes collapsed")
	}
	first := rules[0].(map[string]interface{})
	from := first["from"].([]interface{})[0].(map[string]interface{})["source"].(map[string]interface{})
	if !reflect.DeepEqual(from["namespaces"], []interface{}{"http-app"}) {
		t.Fatal("HTTP source got HTTPS identity")
	}
	target, _, _ := unstructured.NestedMap(policy.Object, "spec", "targetRef")
	if target["kind"] != "ServiceEntry" {
		t.Fatal("central policy was not bound to ServiceEntry")
	}
}

func TestAmbientReconcileRemovesLocalAliasesInsteadOfPublishingUnprotectedVIPs(t *testing.T) {
	client := dynamicfake.NewSimpleDynamicClientWithCustomListKinds(runtime.NewScheme(), map[schema.GroupVersionResource]string{serviceEntryGVR: "ServiceEntryList", egressAuthGVR: "AuthorizationPolicyList", sidecarGVR: "SidecarList"},
		&unstructured.Unstructured{Object: map[string]interface{}{"apiVersion": "networking.istio.io/v1beta1", "kind": "ServiceEntry", "metadata": map[string]interface{}{"name": "legacy-local-host", "namespace": "apps", "uid": "alias", "labels": map[string]interface{}{"uds/package": "app", "istio.io/use-waypoint": "egress-waypoint"}}, "spec": map[string]interface{}{"hosts": []interface{}{"example.com"}}}})
	pkg := &udstypes.UDSPackage{ObjectMeta: metav1.ObjectMeta{Name: "app", Namespace: "apps"}}
	if err := reconcileLocalEgress(context.Background(), client, pkg, map[string][]hostPortProtocol{"example.com": {{Host: "example.com", Port: 443, Protocol: "TLS"}}}); err != nil {
		t.Fatal(err)
	}
	list, err := client.Resource(serviceEntryGVR).Namespace("apps").List(context.Background(), metav1.ListOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if len(list.Items) != 0 {
		t.Fatal("ambient local alias retained an independent unprotected VIP")
	}
	for _, action := range client.Actions() {
		if action.GetVerb() == "patch" {
			t.Fatal("ambient reconciliation created local routing resource")
		}
	}
}
