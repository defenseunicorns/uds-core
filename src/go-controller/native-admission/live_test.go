// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package nativeadmission

import (
	"context"
	"encoding/json"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/admission/policies"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/admission/resources"
	jsonpatch "gopkg.in/evanphx/json-patch.v4"
	corev1 "k8s.io/api/core/v1"
	rbacv1 "k8s.io/api/rbac/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
	"os"
	"reflect"
	"strings"
	"testing"
	"time"
)

// This suite installs cluster-wide policies. CI provides a disposable cluster;
// never fall back to the user's default kubeconfig or current context.
func TestLiveNativeAdmission(t *testing.T) {
	path := os.Getenv("UDS_NATIVE_TEST_KUBECONFIG")
	if path == "" {
		t.Skip("requires an explicitly supplied disposable Kubernetes cluster")
	}
	cfg, err := clientcmd.BuildConfigFromFlags("", path)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	client, err := kubernetes.NewForConfig(cfg)
	if err != nil {
		t.Fatal(err)
	}
	dc, err := dynamic.NewForConfig(cfg)
	if err != nil {
		t.Fatal(err)
	}
	for _, ns := range []string{"native-live", "uds-policy-exemptions", "uds-system"} {
		_, err = client.CoreV1().Namespaces().Create(ctx, &corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: ns}}, metav1.CreateOptions{})
		if err != nil && !apierrors.IsAlreadyExists(err) {
			t.Fatal(err)
		}
	}
	_, err = client.CoreV1().ServiceAccounts("uds-system").Create(ctx, &corev1.ServiceAccount{ObjectMeta: metav1.ObjectMeta{Name: "uds-controller"}}, metav1.CreateOptions{})
	if err != nil && !apierrors.IsAlreadyExists(err) {
		t.Fatal(err)
	}
	_, err = client.RbacV1().ClusterRoleBindings().Create(ctx, &rbacv1.ClusterRoleBinding{ObjectMeta: metav1.ObjectMeta{Name: "native-live-compiler"}, RoleRef: rbacv1.RoleRef{APIGroup: rbacv1.GroupName, Kind: "ClusterRole", Name: "cluster-admin"}, Subjects: []rbacv1.Subject{{Kind: "ServiceAccount", Name: "uds-controller", Namespace: "uds-system"}}}, metav1.CreateOptions{})
	if err != nil && !apierrors.IsAlreadyExists(err) {
		t.Fatal(err)
	}
	compilerCfg := rest.CopyConfig(cfg)
	compilerCfg.Impersonate.UserName = "system:serviceaccount:uds-system:uds-controller"
	compiler, err := dynamic.NewForConfig(compilerCfg)
	if err != nil {
		t.Fatal(err)
	}
	parameterGVR := schema.GroupVersionResource{Group: "policy.uds.dev", Version: "v1alpha1", Resource: "admissionparameters"}
	crdRaw, err := os.ReadFile("../../uds-api/chart/templates/admissionparameters.policy.uds.dev.json")
	if err != nil {
		t.Fatal(err)
	}
	crd := &unstructured.Unstructured{}
	if err = json.Unmarshal(crdRaw, crd); err != nil {
		t.Fatal(err)
	}
	applyLive(t, ctx, dc, schema.GroupVersionResource{Group: "apiextensions.k8s.io", Version: "v1", Resource: "customresourcedefinitions"}, crd)
	paramsRaw, err := os.ReadFile("empty-parameters.json")
	if err != nil {
		t.Fatal(err)
	}
	parameters := &unstructured.Unstructured{}
	json.Unmarshal(paramsRaw, parameters)
	unstructured.SetNestedField(parameters.Object, "live-before", "spec", "revision")
	// CRD establishment and discovery propagate asynchronously.
	deadline := time.Now().Add(20 * time.Second)
	for {
		_, err = compiler.Resource(parameterGVR).Namespace("uds-policy-exemptions").Patch(ctx, "uds-native-grants", types.ApplyPatchType, paramsRaw, metav1.PatchOptions{FieldManager: "native-live", Force: boolPointer(true)})
		if err == nil {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal(err)
		}
		time.Sleep(100 * time.Millisecond)
	}
	applyLive(t, ctx, compiler, parameterGVR, parameters)
	var list unstructured.UnstructuredList
	if err = json.Unmarshal([]byte(encodedContract), &list); err != nil {
		t.Fatal(err)
	}
	for i := range list.Items {
		obj := &list.Items[i]
		applyLive(t, ctx, dc, schema.GroupVersionResource{Group: "admissionregistration.k8s.io", Version: "v1", Resource: policyResource(obj.GetKind())}, obj)
	}
	// Wait until the API server has compiled every validation, and surface warnings.
	for _, item := range list.Items {
		if item.GetKind() != "ValidatingAdmissionPolicy" {
			continue
		}
		deadline = time.Now().Add(20 * time.Second)
		for {
			policy, err := client.AdmissionregistrationV1().ValidatingAdmissionPolicies().Get(ctx, item.GetName(), metav1.GetOptions{})
			if err != nil {
				t.Fatal(err)
			}
			if policy.Status.ObservedGeneration == policy.Generation && policy.Status.TypeChecking != nil {
				if len(policy.Status.TypeChecking.ExpressionWarnings) > 0 {
					t.Fatalf("%s: %v", item.GetName(), policy.Status.TypeChecking.ExpressionWarnings)
				}
				break
			}
			if time.Now().After(deadline) {
				t.Fatal("native validation not compiled", item.GetName())
			}
			time.Sleep(100 * time.Millisecond)
		}
	}
	// Mutation readiness is observed through its effect, not a fixed sleep.
	var created *corev1.Pod
	deadline = time.Now().Add(20 * time.Second)
	for {
		created, err = client.CoreV1().Pods("native-live").Create(ctx, livePod("ready", false), metav1.CreateOptions{DryRun: []string{metav1.DryRunAll}})
		if err == nil && created.Annotations["policy.uds.dev/native-mutation-revision"] == "live-before" {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("native mutation not active", err)
		}
		time.Sleep(100 * time.Millisecond)
	}
	t.Run("mutation matches Go", func(t *testing.T) {
		for _, diagnostic := range []string{"", `{"untrusted":true}`, `["drop-all-capabilities"]`} {
			input := livePod("defaults", false)
			input.Annotations = map[string]string{"uds-core.pepr.dev/mutated": diagnostic}
			input.Spec.InitContainers = []corev1.Container{{Name: "init", Image: "registry.k8s.io/pause:3.10"}}
			actual, err := client.CoreV1().Pods("native-live").Create(ctx, input, metav1.CreateOptions{DryRun: []string{metav1.DryRunAll}})
			if err != nil {
				t.Fatal(err)
			}
			raw, _ := json.Marshal(input)
			object, _ := resources.Decode(raw)
			patches, err := policies.Mutate(object, false, func(string) bool { return false })
			if err != nil {
				t.Fatal(err)
			}
			patchRaw, _ := json.Marshal(patches)
			patch, err := jsonpatch.DecodePatch(patchRaw)
			if err != nil {
				t.Fatal(err)
			}
			expectedRaw, err := patch.Apply(raw)
			if err != nil {
				t.Fatal(err)
			}
			var expected corev1.Pod
			if err = json.Unmarshal(expectedRaw, &expected); err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(actual.Spec.SecurityContext, expected.Spec.SecurityContext) || !reflect.DeepEqual(actual.Spec.Containers[0].SecurityContext, expected.Spec.Containers[0].SecurityContext) || !reflect.DeepEqual(actual.Spec.InitContainers[0].SecurityContext, expected.Spec.InitContainers[0].SecurityContext) || actual.Annotations["uds-core.pepr.dev/mutated"] != expected.Annotations["uds-core.pepr.dev/mutated"] {
				t.Fatal("native mutation diverged from Go", actual.Spec.SecurityContext, expected.Spec.SecurityContext)
			}
		}
	})
	t.Run("parameter writes protected", func(t *testing.T) {
		deadline := time.Now().Add(20 * time.Second)
		for {
			// TypeChecking status precedes binding activation. Observe an actual
			// rejection without ever persisting a permissive/invalid snapshot.
			_, err := dc.Resource(parameterGVR).Namespace("uds-policy-exemptions").Patch(ctx, "uds-native-grants", types.MergePatchType, []byte(`{"spec":{"valid":false}}`), metav1.PatchOptions{DryRun: []string{metav1.DryRunAll}})
			if err != nil && strings.Contains(err.Error(), "Only the UDS controller") {
				break
			}
			if err != nil {
				t.Fatal("parameter canary failed outside expected policy", err)
			}
			if time.Now().After(deadline) {
				t.Fatal("parameter protection binding never enforced")
			}
			time.Sleep(100 * time.Millisecond)
		}
	})
	t.Run("ephemeral update after revision change", func(t *testing.T) {
		input := livePod("", false)
		input.GenerateName = "native-debug-"
		pod, err := client.CoreV1().Pods("native-live").Create(ctx, input, metav1.CreateOptions{})
		if err != nil {
			t.Fatal(err)
		}
		unstructured.SetNestedField(parameters.Object, "live-after", "spec", "revision")
		applyLive(t, ctx, compiler, parameterGVR, parameters)
		for _, privileged := range []bool{false, true} {
			update := pod.DeepCopy()
			update.Spec.EphemeralContainers = []corev1.EphemeralContainer{{EphemeralContainerCommon: corev1.EphemeralContainerCommon{Name: "debugger", Image: "registry.k8s.io/pause:3.10", SecurityContext: &corev1.SecurityContext{Privileged: &privileged}}}}
			result, err := client.CoreV1().Pods("native-live").UpdateEphemeralContainers(ctx, pod.Name, update, metav1.UpdateOptions{DryRun: []string{metav1.DryRunAll}})
			if privileged {
				if err == nil || !strings.Contains(err.Error(), "Privilege escalation") {
					t.Fatal("privileged debug container allowed", err)
				}
			} else if err != nil || result.Spec.EphemeralContainers[0].SecurityContext.Capabilities == nil {
				t.Fatal("safe debug container rejected or not mutated", err)
			}
		}
	})
	t.Run("parameter namespace teardown", func(t *testing.T) {
		ns, err := client.CoreV1().Namespaces().Create(ctx, &corev1.Namespace{ObjectMeta: metav1.ObjectMeta{GenerateName: "native-teardown-"}}, metav1.CreateOptions{})
		if err != nil {
			t.Fatal(err)
		}
		snapshot := parameters.DeepCopy()
		snapshot.SetNamespace(ns.Name)
		applyLive(t, ctx, compiler, parameterGVR, snapshot)
		if err = client.CoreV1().Namespaces().Delete(ctx, ns.Name, metav1.DeleteOptions{}); err != nil {
			t.Fatal(err)
		}
		deadline := time.Now().Add(time.Minute)
		for {
			_, err = client.CoreV1().Namespaces().Get(ctx, ns.Name, metav1.GetOptions{})
			if apierrors.IsNotFound(err) {
				break
			}
			if err != nil {
				t.Fatal(err)
			}
			if time.Now().After(deadline) {
				t.Fatal("parameter protection blocked namespace teardown")
			}
			time.Sleep(time.Second)
		}
	})
}

func boolPointer(v bool) *bool { return &v }
func livePod(name string, privileged bool) *corev1.Pod {
	pod := &corev1.Pod{TypeMeta: metav1.TypeMeta{APIVersion: "v1", Kind: "Pod"}, ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: "native-live"}, Spec: corev1.PodSpec{NodeName: "nonexistent", Containers: []corev1.Container{{Name: "app", Image: "registry.k8s.io/pause:3.10"}}}}
	if privileged {
		pod.Spec.Containers[0].SecurityContext = &corev1.SecurityContext{Privileged: &privileged}
	}
	return pod
}
func applyLive(t *testing.T, ctx context.Context, client dynamic.Interface, gvr schema.GroupVersionResource, obj *unstructured.Unstructured) {
	t.Helper()
	raw, err := json.Marshal(obj)
	if err != nil {
		t.Fatal(err)
	}
	_, err = client.Resource(gvr).Namespace(obj.GetNamespace()).Patch(ctx, obj.GetName(), types.ApplyPatchType, raw, metav1.PatchOptions{FieldManager: "native-live", Force: boolPointer(true)})
	if err != nil {
		t.Fatal(obj.GetKind(), obj.GetName(), err)
	}
}

func policyResource(kind string) string {
	if strings.HasSuffix(kind, "Policy") {
		return strings.ToLower(strings.TrimSuffix(kind, "y")) + "ies"
	}
	return strings.ToLower(kind) + "s"
}
