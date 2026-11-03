// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package dependencies

import (
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/config"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/fake"
	"reflect"
	"testing"
)

func tunnelPod() *corev1.Pod {
	return &corev1.Pod{ObjectMeta: metav1.ObjectMeta{Name: "proxy", Namespace: "kube-system", ResourceVersion: "1", Labels: map[string]string{"app": "konnectivity-agent"}},
		Spec:   corev1.PodSpec{Containers: []corev1.Container{{Name: "unused", Image: "not-cached"}}},
		Status: corev1.PodStatus{Phase: corev1.PodRunning, PodIP: "10.244.0.99", PodIPs: []corev1.PodIP{{IP: "10.244.0.99"}, {IP: "fd00::99"}}}}
}

func TestAPITunnelDiscoveryIsScopedAndRevocable(t *testing.T) {
	pod := tunnelPod()
	want := []string{"10.244.0.99/32", "fd00::99/128"}
	if got := APITunnelCIDRs([]interface{}{pod, pod}); !reflect.DeepEqual(got, want) {
		t.Fatal(got)
	}
	for _, change := range []func(*corev1.Pod){
		func(p *corev1.Pod) { p.Namespace = "tenant" },
		func(p *corev1.Pod) { p.Labels["app"] = "other" },
		func(p *corev1.Pod) { now := metav1.Now(); p.DeletionTimestamp = &now },
		func(p *corev1.Pod) { p.Status.Phase = corev1.PodSucceeded },
	} {
		changed := pod.DeepCopy()
		change(changed)
		if got := APITunnelCIDRs([]interface{}{changed}); len(got) != 0 {
			t.Fatalf("untrusted/inactive Pod granted: %v", got)
		}
	}
	changed := pod.DeepCopy()
	changed.ResourceVersion = "2"
	changed.Status.PodIP = "10.244.0.100"
	if !relevantChange(pod, changed) {
		t.Fatal("address update was ignored")
	}
	changed = pod.DeepCopy()
	changed.Labels = nil
	if discoveryInput(changed) != "tunnels" {
		t.Fatal("leaving the selector did not revoke discovery")
	}
	pod.Namespace = "tenant"
	changed = pod.DeepCopy()
	changed.ResourceVersion = "2"
	changed.Status.PodIP = "10.244.0.100"
	if relevantChange(pod, changed) || discoveryInput(changed) != "" {
		t.Fatal("workload Pod status entered discovery")
	}
}

func TestAPITunnelCacheDropsWorkloadContents(t *testing.T) {
	original := tunnelPod()
	original.Annotations = map[string]string{"kubectl.kubernetes.io/last-applied-configuration": "workload contents"}
	value, err := trimAPITunnelPod(original)
	if err != nil {
		t.Fatal(err)
	}
	trimmed := value.(*corev1.Pod)
	if len(trimmed.Spec.Containers) != 0 || len(trimmed.Annotations) != 0 || len(original.Spec.Containers) != 1 {
		t.Fatal("transform retained workload contents or mutated informer input")
	}
	if !reflect.DeepEqual(APITunnelCIDRs([]interface{}{trimmed}), APITunnelCIDRs([]interface{}{original})) {
		t.Fatal("transform lost discovery authority")
	}
}

func TestAPITunnelAddressesNeverExpandEgress(t *testing.T) {
	cfg := config.Config{DiscoveredAPICIDRs: []string{"192.0.2.1/32"}, APIIngressTunnelCIDRs: []string{"10.244.0.99/32"}}
	if !reflect.DeepEqual(cfg.APICIDRs(), []string{"192.0.2.1/32"}) {
		t.Fatal("proxy entered egress")
	}
	if !reflect.DeepEqual(cfg.APIIngressCIDRs(), []string{"10.244.0.99/32", "192.0.2.1/32"}) {
		t.Fatal("proxy missing from ingress")
	}
}

func TestTunnelSnapshotRevokesAddressesWhenPodLeaves(t *testing.T) {
	previous := config.Get()
	t.Cleanup(func() { config.Replace(previous) })
	config.Replace(config.Config{DiscoveredAPICIDRs: []string{"192.0.2.1/32"}})
	client := fake.NewClientset()
	inputs := NewInputs(client)
	controller := New(client, inputs, &packageEvents{})
	defer controller.queue.ShutDown()
	pod := tunnelPod()
	if err := inputs.APITunnels.GetStore().Add(pod); err != nil {
		t.Fatal(err)
	}
	controller.refresh(map[string]bool{"tunnels": true})
	if len(config.Get().APIIngressTunnelCIDRs) != 2 {
		t.Fatal("discovery did not publish agent addresses")
	}
	if err := inputs.APITunnels.GetStore().Delete(pod); err != nil {
		t.Fatal(err)
	}
	controller.refresh(map[string]bool{"tunnels": true})
	if len(config.Get().APIIngressTunnelCIDRs) != 0 || !reflect.DeepEqual(config.Get().APICIDRs(), []string{"192.0.2.1/32"}) {
		t.Fatal("removed agent retained authority or altered API egress")
	}
}
