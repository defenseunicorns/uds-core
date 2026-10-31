// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package webhook

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/defenseunicorns/uds-core/src/go-controller/internal/admission/resources"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
)

func TestNativeMutationRevisionRequiresSameValidatingSnapshot(t *testing.T) {
	expressions, _ := nativeExpressions(t, "uds-native-pod-profile")
	for _, stamp := range []string{"", "old", "current", "forged"} {
		activation := map[string]interface{}{"object": map[string]interface{}{"metadata": map[string]interface{}{"annotations": map[string]interface{}{"policy.uds.dev/native-mutation-revision": stamp}}}, "params": map[string]interface{}{"spec": map[string]interface{}{"revision": "current"}}}
		if actual := evalNative(t, expressions["mutationReady"], activation); actual != (stamp == "current") {
			t.Fatalf("mutation/validation revision %q got %v", stamp, actual)
		}
	}
}

func TestVectorRootExemptionCannotMixNativeAndGoSnapshots(t *testing.T) {
	store := NewExemptionStore()
	if err := store.Replace(nil, false); err != nil {
		t.Fatal(err)
	}
	metadata, _ := resources.Decode([]byte(`{"name":"vector-node-log-writer-unit","namespace":"vector-node-log-test"}`))
	_, oldRevision, _ := store.MetadataSnapshot(metadata)
	grant := &unstructured.Unstructured{Object: map[string]interface{}{"metadata": map[string]interface{}{"uid": "owner", "namespace": "uds-policy-exemptions"}, "spec": map[string]interface{}{"exemptions": []interface{}{map[string]interface{}{"matcher": map[string]interface{}{"namespace": "vector-node-log-test", "name": "^vector-node-log-writer.*", "kind": "pod"}, "policies": []interface{}{"RequireNonRootUser"}}}}}}
	if err := store.Replace([]*unstructured.Unstructured{grant}, false); err != nil {
		t.Fatal(err)
	}
	exempt, currentRevision, ready := store.MetadataSnapshot(metadata)
	if !ready || !exempt("RequireNonRootUser") || currentRevision == oldRevision {
		t.Fatal("grant/revision snapshot was not atomic")
	}
	object := map[string]interface{}{"metadata": map[string]interface{}{"name": "vector-node-log-writer-unit", "namespace": "vector-node-log-test", "annotations": map[string]interface{}{}}, "spec": map[string]interface{}{"securityContext": map[string]interface{}{}, "containers": []interface{}{map[string]interface{}{"name": "writer", "securityContext": map[string]interface{}{"runAsUser": 0, "runAsGroup": 0, "allowPrivilegeEscalation": false, "capabilities": map[string]interface{}{"drop": []string{"ALL"}}}}}}}
	for _, stamp := range []string{oldRevision, "forged", currentRevision} {
		object["metadata"].(map[string]interface{})["annotations"] = map[string]interface{}{nativeMutationRevisionAnnotation: stamp}
		raw, _ := json.Marshal(object)
		mutation := callPodHandler(t, MutateNonRootUser(store), raw)
		validation := callPodHandler(t, ValidatePod(store), raw)
		if stamp != currentRevision {
			if mutation.Allowed || validation.Allowed || mutation.Result.Code != 409 || len(mutation.Patch) > 0 {
				t.Fatal("cross-snapshot admission did not deny/retry before mutation")
			}
		} else if !mutation.Allowed || !validation.Allowed || strings.Contains(string(mutation.Patch), "/spec/securityContext/") {
			t.Fatal("current legitimate root exemption acquired non-root defaults", string(mutation.Patch), validation.Result)
		}
	}
	if err := store.Replace(nil, false); err != nil {
		t.Fatal(err)
	}
	if !exempt("RequireNonRootUser") {
		t.Fatal("an in-flight evaluator did not retain its pinned snapshot")
	}
	fresh, revokedRevision, _ := store.MetadataSnapshot(metadata)
	if fresh("RequireNonRootUser") || revokedRevision != oldRevision {
		t.Fatal("revocation did not restore the enforcing snapshot")
	}
	object["metadata"].(map[string]interface{})["annotations"] = map[string]interface{}{nativeMutationRevisionAnnotation: currentRevision}
	raw, _ := json.Marshal(object)
	if result := callPodHandler(t, ValidatePod(store), raw); result.Allowed {
		t.Fatal("stale mutation stamp kept a revoked grant")
	}
}
