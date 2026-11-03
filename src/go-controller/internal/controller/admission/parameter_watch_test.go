// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package admission

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	compiled "github.com/defenseunicorns/uds-core/src/go-controller/internal/admission/exemptions"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	dynamicfake "k8s.io/client-go/dynamic/fake"
	ktesting "k8s.io/client-go/testing"
	"k8s.io/client-go/tools/cache"
	cachetesting "k8s.io/client-go/tools/cache/testing"
)

func TestCompilerRepairsParameterDriftWithoutAnExemptionChange(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	grants := cachetesting.NewFakeControllerSource()
	parameters := cachetesting.NewFakeControllerSource()
	grantInformer := cache.NewSharedIndexInformer(grants, &unstructured.Unstructured{}, 0, cache.Indexers{})
	parameterInformer := cache.NewSharedIndexInformer(parameters, &unstructured.Unstructured{}, 0, cache.Indexers{})
	client := dynamicfake.NewSimpleDynamicClient(runtime.NewScheme())
	published := make(chan []byte, 10)
	client.PrependReactor("patch", "admissionparameters", func(action ktesting.Action) (bool, runtime.Object, error) {
		published <- action.(ktesting.PatchAction).GetPatch()
		return true, &unstructured.Unstructured{}, nil
	})
	compiler := NewCompiler(client, grantInformer)
	compiler.WatchParameters(parameterInformer)
	go grantInformer.Run(ctx.Done())
	go parameterInformer.Run(ctx.Done())
	if !cache.WaitForCacheSync(ctx.Done(), grantInformer.HasSynced, parameterInformer.HasSynced) {
		t.Fatal("fixture informer did not synchronize")
	}
	stopped := make(chan struct{})
	go func() { defer close(stopped); compiler.Run(ctx) }()
	t.Cleanup(func() { cancel(); <-stopped })
	awaitValidPublication := func() {
		t.Helper()
		select {
		case raw := <-published:
			var body struct{ Spec compiled.Parameters }
			if err := json.Unmarshal(raw, &body); err != nil || !body.Spec.Valid || body.Spec.Revision == "bootstrap-empty" || len(body.Spec.NativeMatchers) != 0 {
				t.Fatalf("repair did not compile the authoritative empty source: %s, %v", raw, err)
			}
		case <-time.After(5 * time.Second):
			t.Fatal("parameter drift did not enqueue compiler publication")
		}
	}
	awaitValidPublication()
	object := &unstructured.Unstructured{Object: map[string]interface{}{
		"apiVersion": "policy.uds.dev/v1alpha1", "kind": "AdmissionParameters",
		"metadata": map[string]interface{}{"name": "uds-native-grants", "namespace": compiled.ProtectedNamespace, "uid": "snapshot"},
		"spec":     map[string]interface{}{"valid": false, "revision": "bootstrap-empty"},
	}}
	parameters.Add(object)
	awaitValidPublication()
	changed := object.DeepCopy()
	changed.Object["spec"] = map[string]interface{}{"valid": true, "revision": "untrusted-replacement"}
	parameters.Modify(changed)
	awaitValidPublication()
	parameters.Delete(changed)
	awaitValidPublication()
}

func TestParameterRecoveryIgnoresOtherObjectsAndHandlesTombstones(t *testing.T) {
	compiler := NewCompiler(nil, cache.NewSharedIndexInformer(nil, &unstructured.Unstructured{}, 0, cache.Indexers{}))
	t.Cleanup(compiler.queue.ShutDown)
	object := &unstructured.Unstructured{}
	object.SetName("uds-native-grants")
	object.SetNamespace("tenant")
	compiler.parametersChanged(object)
	object.SetNamespace(compiled.ProtectedNamespace)
	object.SetName("unrelated")
	compiler.parametersChanged(object)
	compiler.parametersChanged(cache.DeletedFinalStateUnknown{Obj: "invalid"})
	if compiler.queue.Len() != 0 {
		t.Fatal("unrelated parameter object enqueued protected snapshot publication")
	}
	object.SetName("uds-native-grants")
	compiler.parametersChanged(cache.DeletedFinalStateUnknown{Obj: object})
	if compiler.queue.Len() != 1 {
		t.Fatal("lost deletion tombstone prevented protected snapshot recovery")
	}
}
