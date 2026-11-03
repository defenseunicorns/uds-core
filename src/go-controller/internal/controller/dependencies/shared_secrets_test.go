// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package dependencies

import (
	"encoding/json"
	"reflect"
	"testing"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/util/workqueue"
)

func sharedSecretFixture(t *testing.T) (*Controller, *packageEvents) {
	t.Helper()
	events := &packageEvents{}
	ctrl := &Controller{packages: events, queue: workqueue.NewTypedRateLimitingQueue(workqueue.DefaultTypedControllerRateLimiter[string]())}
	t.Cleanup(ctrl.queue.ShutDown)
	return ctrl, events
}

func authSecret(t *testing.T, chains ...map[string]interface{}) *corev1.Secret {
	t.Helper()
	data, err := json.Marshal(map[string]interface{}{"allow_unmatched_requests": false, "chains": chains})
	if err != nil {
		t.Fatal(err)
	}
	return &corev1.Secret{ObjectMeta: metav1.ObjectMeta{Name: "authservice-uds", Namespace: "authservice"}, Data: map[string][]byte{"config.json": data}}
}

func TestAuthserviceChainDriftTargetsOwnersAndIgnoresOrderAndMetadata(t *testing.T) {
	one := map[string]interface{}{"name": "one", "filter": "original"}
	two := map[string]interface{}{"name": "two", "filter": "unchanged"}
	old := authSecret(t, one, two)
	for _, scenario := range []string{"normal-write", "removed-chain", "metadata-only", "reorder", "global-default", "invalid", "missing-key", "deletion"} {
		t.Run(scenario, func(t *testing.T) {
			ctrl, events := sharedSecretFixture(t)
			current := old.DeepCopy()
			want := []string{}
			switch scenario {
			case "normal-write":
				current = authSecret(t, map[string]interface{}{"name": "one", "filter": "desired-update"}, two)
				want = []string{"client:one"}
			case "removed-chain":
				current = authSecret(t, two)
				want = []string{"client:one"}
			case "metadata-only":
				current.ResourceVersion = "new"
				current.Labels = map[string]string{"helm": "changed"}
			case "reorder":
				current = authSecret(t, two, one)
			case "global-default":
				current.Data["config.json"] = []byte(`{"allow_unmatched_requests":true,"chains":[{"name":"one","filter":"original"},{"name":"two","filter":"unchanged"}]}`)
			case "invalid":
				current.Data["config.json"] = []byte(`{"chains":`)
				want = []string{"all"}
			case "missing-key":
				current.Data = nil
				want = []string{"all"}
			case "deletion":
				current = nil
				want = []string{"all"}
			}
			ctrl.sharedSecretChanged(old, current)
			if got := events.snapshot(); !reflect.DeepEqual(got, want) {
				t.Fatalf("shared chain change broadened/lost repair: %v want %v", got, want)
			}
			if (scenario == "global-default" || scenario == "invalid" || scenario == "missing-key" || scenario == "deletion") && ctrl.queue.Len() != 1 {
				t.Fatal("global config repair not scheduled")
			}
		})
	}
}

func blackboxSecret(t *testing.T, modules map[string]interface{}, owners map[string][]string) *corev1.Secret {
	t.Helper()
	data, err := json.Marshal(map[string]interface{}{"modules": modules})
	if err != nil {
		t.Fatal(err)
	}
	journal, err := json.Marshal(owners)
	if err != nil {
		t.Fatal(err)
	}
	return &corev1.Secret{ObjectMeta: metav1.ObjectMeta{Name: "uds-prometheus-blackbox-config", Namespace: "monitoring", Annotations: map[string]string{"uds.dev/probe-owners": string(journal)}}, Data: map[string][]byte{"blackbox.yaml": data}}
}

func TestUptimeModuleDriftAndOwnershipLossTargetsBothUIDJournals(t *testing.T) {
	modules := map[string]interface{}{"http_2xx": map[string]interface{}{"prober": "http"}, "one": map[string]interface{}{"oauth2": "original"}, "two": map[string]interface{}{"oauth2": "unchanged"}}
	owners := map[string][]string{"pkg-one": {"one"}, "pkg-two": {"two"}}
	old := blackboxSecret(t, modules, owners)
	for _, scenario := range []string{"normal-write", "module-loss", "owner-loss", "metadata-only", "global-module", "invalid-owners", "invalid-data", "deletion"} {
		t.Run(scenario, func(t *testing.T) {
			ctrl, events := sharedSecretFixture(t)
			current := old.DeepCopy()
			want := []string{}
			switch scenario {
			case "normal-write":
				current = blackboxSecret(t, map[string]interface{}{"http_2xx": modules["http_2xx"], "one": map[string]interface{}{"oauth2": "updated"}, "two": modules["two"]}, owners)
				want = []string{"uid:pkg-one"}
			case "module-loss":
				current = blackboxSecret(t, map[string]interface{}{"http_2xx": modules["http_2xx"], "two": modules["two"]}, owners)
				want = []string{"uid:pkg-one"}
			case "owner-loss":
				current = blackboxSecret(t, modules, map[string][]string{"pkg-two": {"two"}})
				want = []string{"uid:pkg-one"}
			case "metadata-only":
				current.ResourceVersion = "new"
				current.Labels = map[string]string{"helm": "changed"}
			case "global-module":
				current = blackboxSecret(t, map[string]interface{}{"one": modules["one"], "two": modules["two"]}, owners)
				want = []string{"all"}
			case "invalid-owners":
				current.Annotations["uds.dev/probe-owners"] = "malformed"
				want = []string{"all"}
			case "invalid-data":
				current.Data["blackbox.yaml"] = []byte("{{invalid")
				want = []string{"all"}
			case "deletion":
				current = nil
				want = []string{"all"}
			}
			ctrl.sharedSecretChanged(old, current)
			if got := events.snapshot(); !reflect.DeepEqual(got, want) {
				t.Fatalf("module owner recovery broadened/lost: %v want %v", got, want)
			}
		})
	}
}

func TestUnrelatedSecretCannotBroadcastPackageRecovery(t *testing.T) {
	ctrl, events := sharedSecretFixture(t)
	old := authSecret(t, map[string]interface{}{"name": "one"})
	old.Namespace = "other"
	current := old.DeepCopy()
	current.Data["config.json"] = []byte("malformed")
	ctrl.sharedSecretChanged(old, current)
	if len(events.snapshot()) != 0 || ctrl.queue.Len() != 0 {
		t.Fatal("unrelated Secret scheduled shared authority writes")
	}
}
