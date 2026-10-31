// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package admission

import (
	"context"
	"encoding/json"
	"fmt"
	compiled "github.com/defenseunicorns/uds-core/src/go-controller/internal/admission/exemptions"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/config"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/tools/cache"
	"k8s.io/client-go/util/workqueue"
	"log/slog"
	"time"
)

var parameterGVR = schema.GroupVersionResource{Group: "policy.uds.dev", Version: "v1alpha1", Resource: "admissionparameters"}

type Compiler struct {
	client   dynamic.Interface
	informer cache.SharedIndexInformer
	queue    workqueue.TypedRateLimitingInterface[string]
}

func NewCompiler(client dynamic.Interface, informer cache.SharedIndexInformer) *Compiler {
	compiler := &Compiler{client: client, informer: informer, queue: workqueue.NewTypedRateLimitingQueue(workqueue.NewTypedItemExponentialFailureRateLimiter[string](time.Second, 30*time.Second))}
	informer.AddEventHandler(cache.ResourceEventHandlerFuncs{AddFunc: func(interface{}) { compiler.queue.Add("snapshot") }, UpdateFunc: func(interface{}, interface{}) { compiler.queue.Add("snapshot") }, DeleteFunc: func(interface{}) { compiler.queue.Add("snapshot") }})
	return compiler
}

func (c *Compiler) Enqueue() { c.queue.Add("snapshot") }

func (c *Compiler) Run(ctx context.Context) {
	defer c.queue.ShutDown()
	if !cache.WaitForCacheSync(ctx.Done(), c.informer.HasSynced) {
		return
	}
	c.queue.Add("snapshot")
	stopped := make(chan struct{})
	go func() {
		defer close(stopped)
		for c.next(ctx) {
		}
	}()
	<-ctx.Done()
	c.queue.ShutDown()
	<-stopped
}

func (c *Compiler) next(ctx context.Context) bool {
	key, stopped := c.queue.Get()
	if stopped {
		return false
	}
	defer c.queue.Done(key)
	if err := c.Publish(ctx); err != nil {
		slog.Error("Native admission input compilation failed", "error", err)
		c.queue.AddRateLimited(key)
	} else {
		c.queue.Forget(key)
	}
	return true
}

func (c *Compiler) Publish(ctx context.Context) error {
	objects := []*unstructured.Unstructured{}
	for _, object := range c.informer.GetStore().List() {
		if value, ok := object.(*unstructured.Unstructured); ok {
			objects = append(objects, value.DeepCopy())
		}
	}
	parameters, err := compiled.Compile(objects, config.Get().AllowAllNSExemptions)
	compileErr := err
	if compileErr != nil {
		// Revoke stale authority even when a new input cannot be compiled.
		// Bindings reject this explicitly invalid snapshot; an error must not
		// leave an older exemption revision active indefinitely.
		parameters = compiled.Parameters{NativeMatchers: []compiled.Matcher{}, LegacyScopes: []compiled.LegacyScope{}, Revision: "invalid-input", Valid: false, AllowAllNamespaces: config.Get().AllowAllNSExemptions}
	}
	// Server-side apply replaces the entire union owned by this one compiler.
	// Empty is a real enforcing snapshot; absence is never treated as a grant.
	body := map[string]interface{}{"apiVersion": "policy.uds.dev/v1alpha1", "kind": "AdmissionParameters", "metadata": map[string]interface{}{"name": "uds-native-grants", "namespace": compiled.ProtectedNamespace}, "spec": parameters}
	raw, err := json.Marshal(body)
	if err != nil {
		return err
	}
	force := true
	_, err = c.client.Resource(parameterGVR).Namespace(compiled.ProtectedNamespace).Patch(ctx, "uds-native-grants", types.ApplyPatchType, raw, metav1.PatchOptions{FieldManager: "uds-native-admission-compiler", Force: &force})
	if err != nil {
		return fmt.Errorf("publish native admission input: %w", err)
	}
	return compileErr
}
