// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package dependencies

import (
	"context"
	"fmt"
	"testing"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/fake"
	ktesting "k8s.io/client-go/testing"
)

func TestDependencyListAndWatchScopes(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	client := fake.NewClientset()
	inputs := NewInputs(client)
	controller := New(client, inputs, &packageEvents{})
	defer controller.queue.ShutDown()
	if err := inputs.Start(ctx); err != nil {
		t.Fatal(err)
	}
	seen := map[string]bool{}
	for _, action := range client.Actions() {
		resource := action.GetResource().Resource
		if resource == "pods" {
			t.Fatal("dependency factory opened a Pod cache")
		}
		var field, label string
		switch action := action.(type) {
		case ktesting.ListAction:
			field, label = action.GetListRestrictions().Fields.String(), action.GetListRestrictions().Labels.String()
		case ktesting.WatchAction:
			field, label = action.GetWatchRestrictions().Fields.String(), action.GetWatchRestrictions().Labels.String()
		default:
			continue
		}
		key := resource + "/" + action.GetNamespace() + "/" + field + "/" + label
		seen[action.GetVerb()+"/"+key] = true
		switch resource {
		case "secrets", "configmaps":
			if label != "uds.dev/pod-reload=true" && (action.GetNamespace() == "" || field == "") {
				t.Fatalf("unbounded configuration watch: %s", key)
			}
		case "services":
			if action.GetNamespace() != "default" || field != "metadata.name=kubernetes" {
				t.Fatalf("unbounded Service watch: %s", key)
			}
		case "endpointslices":
			if action.GetNamespace() != "default" || label != "kubernetes.io/service-name=kubernetes" {
				t.Fatalf("unbounded API endpoint discovery: %s", key)
			}
		}
	}
	for _, key := range []string{
		"secrets/uds-system/metadata.name=uds-operator-config/",
		"secrets/keycloak/metadata.name=keycloak-client-secrets/",
		"secrets/authservice/metadata.name=authservice-uds/",
		"secrets/monitoring/metadata.name=uds-prometheus-blackbox-config/",
		"configmaps/istio-system/metadata.name=istio/",
		"configmaps/uds-system/metadata.name=uds-ca-certs/",
		"secrets///uds.dev/pod-reload=true", "configmaps///uds.dev/pod-reload=true",
	} {
		for _, verb := range []string{"list", "watch"} {
			if !seen[verb+"/"+key] {
				t.Errorf("required input is missing %s: %s", verb, key)
			}
		}
	}
}

func TestPodRolloutDoesNotReconcilePackages(t *testing.T) {
	events := &packageEvents{}
	client := fake.NewClientset()
	c := New(client, NewInputs(client), events)
	defer c.queue.ShutDown()
	for n := range 100 {
		pod := &corev1.Pod{ObjectMeta: metav1.ObjectMeta{Name: fmt.Sprintf("rollout-%d", n), Namespace: "app", Labels: map[string]string{"uds/package": "shared-forged"}}}
		c.changed(pod)
		updated := pod.DeepCopy()
		updated.Labels["rollout"] = "new"
		c.changed(updated)
	}
	if got := events.snapshot(); len(got) != 0 {
		t.Fatalf("Pod events enqueued Package work: %v", got)
	}
	if c.queue.Len() != 0 {
		t.Fatal("Pod events scheduled global dependency work")
	}
}
