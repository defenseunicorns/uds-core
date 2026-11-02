// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package webhook

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/apimachinery/pkg/util/wait"
	yamlutil "k8s.io/apimachinery/pkg/util/yaml"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestLiveRegistrationRepairHelmUpgradeAndTeardown(t *testing.T) {
	path, cli := os.Getenv("UDS_REGISTRATION_TEST_KUBECONFIG"), os.Getenv("UDS_TRANSITION_TEST_CLI")
	if path == "" || cli == "" {
		t.Skip("requires an explicit empty disposable cluster and UDS CLI")
	}
	cfg, err := clientcmd.BuildConfigFromFlags("", path)
	if err != nil {
		t.Fatal(err)
	}
	cfg.QPS = 100
	cfg.Burst = 200
	client, err := kubernetes.NewForConfig(cfg)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	if _, err := client.RbacV1().ClusterRoles().Get(ctx, "uds-controller", metav1.GetOptions{}); !apierrors.IsNotFound(err) {
		t.Fatal("refusing existing Core lifecycle owner", err)
	}
	for _, target := range registrationTargets {
		if target.mutating {
			_, err = client.AdmissionregistrationV1().MutatingWebhookConfigurations().Get(ctx, target.name, metav1.GetOptions{})
		} else {
			_, err = client.AdmissionregistrationV1().ValidatingWebhookConfigurations().Get(ctx, target.name, metav1.GetOptions{})
		}
		if !apierrors.IsNotFound(err) {
			t.Fatal("refusing existing admission registration", err)
		}
	}
	ns, err := client.CoreV1().Namespaces().Create(ctx, &corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: servingNamespace}}, metav1.CreateOptions{})
	if err != nil {
		t.Fatal(err)
	}
	helm := func(args ...string) []byte {
		t.Helper()
		args = append([]string{"zarf", "tools", "helm"}, args...)
		args = append(args, "--kubeconfig", path)
		out, err := exec.CommandContext(ctx, cli, args...).CombinedOutput()
		if err != nil {
			t.Fatalf("Helm command failed: %v: %s", err, out)
		}
		return out
	}
	t.Cleanup(func() {
		cleanup, stop := context.WithTimeout(context.Background(), 45*time.Second)
		defer stop()
		out, err := exec.CommandContext(cleanup, cli, "zarf", "tools", "helm", "uninstall", "uds-controller", "-n", servingNamespace, "--ignore-not-found", "--wait", "--timeout", "30s", "--kubeconfig", path).CombinedOutput()
		if err != nil {
			t.Errorf("Helm cleanup: %v: %s", err, out)
		}
		if err := client.CoreV1().Namespaces().Delete(cleanup, ns.Name, metav1.DeleteOptions{Preconditions: &metav1.Preconditions{UID: &ns.UID}}); err != nil {
			t.Error(err)
		}
	})
	rendered := helm("template", "uds-controller", "../chart", "--namespace", servingNamespace, "--kube-version", "1.37.1", "--api-versions", "admissionregistration.k8s.io/v1/MutatingAdmissionPolicy", "--set", "nativeAdmission.narrowCallbacks=true")
	decoder := yamlutil.NewYAMLOrJSONDecoder(bytes.NewReader(rendered), 4096)
	var base []map[string]interface{}
	for {
		var obj map[string]interface{}
		err := decoder.Decode(&obj)
		if err == io.EOF {
			break
		}
		if err != nil {
			t.Fatal(err)
		}
		switch obj["kind"] {
		case "ConfigMap", "Secret", "ServiceAccount", "ClusterRole", "ClusterRoleBinding", "ValidatingWebhookConfiguration", "MutatingWebhookConfiguration":
			meta, _ := obj["metadata"].(map[string]interface{})
			name, _ := meta["name"].(string)
			if name == registrationPlanName || name == servingSecretName || name == "uds-controller" || obj["kind"] == "ValidatingWebhookConfiguration" || obj["kind"] == "MutatingWebhookConfiguration" {
				base = append(base, obj)
			}
		}
	}
	chart := t.TempDir()
	if err := os.Mkdir(filepath.Join(chart, "templates"), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(chart, "Chart.yaml"), []byte("apiVersion: v2\nname: uds-controller\nversion: 0.0.1\n"), 0600); err != nil {
		t.Fatal(err)
	}
	stage := func(active bool, timeout int, owner types.UID) {
		t.Helper()
		raw, _ := json.Marshal(base)
		var objects []map[string]interface{}
		json.Unmarshal(raw, &objects)
		var plan map[string]interface{}
		hooks := []interface{}{}
		docs := []map[string]interface{}{}
		for _, obj := range objects {
			meta := obj["metadata"].(map[string]interface{})
			if meta["name"] == registrationPlanName {
				plan = obj
				continue
			}
			if obj["kind"] == "ValidatingWebhookConfiguration" || obj["kind"] == "MutatingWebhookConfiguration" {
				// Keep real rules and conditions, but select no test-cluster namespaces.
				// The sole cluster-scoped callback targets an absent Core CRD.
				for _, raw := range obj["webhooks"].([]interface{}) {
					h := raw.(map[string]interface{})
					h["namespaceSelector"] = map[string]interface{}{"matchLabels": map[string]interface{}{"uds.dev/registration-live-test": "never"}}
					h["timeoutSeconds"] = timeout
				}
				annotations := meta["annotations"].(map[string]interface{})
				annotations["meta.helm.sh/release-name"] = "uds-controller"
				annotations["meta.helm.sh/release-namespace"] = servingNamespace
				if owner != "" {
					meta["ownerReferences"] = []interface{}{map[string]interface{}{"apiVersion": "rbac.authorization.k8s.io/v1", "kind": "ClusterRole", "name": "uds-controller", "uid": string(owner), "controller": true}}
				}
				copyRaw, _ := json.Marshal(obj)
				var desired map[string]interface{}
				json.Unmarshal(copyRaw, &desired)
				for _, raw := range desired["webhooks"].([]interface{}) {
					raw.(map[string]interface{})["clientConfig"].(map[string]interface{})["caBundle"] = ""
				}
				hooks = append(hooks, desired)
				if active {
					docs = append(docs, obj)
				}
			} else {
				docs = append(docs, obj)
			}
		}
		data := plan["data"].(map[string]interface{})
		data["active"] = fmt.Sprint(active)
		data["ownerUID"] = string(owner)
		raw, _ = json.Marshal(map[string]interface{}{"items": hooks})
		data["registrations.json"] = string(raw)
		docs = append(docs, plan)
		var output bytes.Buffer
		for i, obj := range docs {
			if obj["apiVersion"] == nil {
				t.Fatalf("fixture lacks apiVersion: kind=%v", obj["kind"])
			}
			if i > 0 {
				output.WriteString("---\n")
			}
			raw, _ := json.Marshal(obj)
			output.Write(raw)
			output.WriteString("\n")
		}
		if err := os.WriteFile(filepath.Join(chart, "templates/fixture.yaml"), output.Bytes(), 0600); err != nil {
			t.Fatal(err)
		}
	}
	stage(false, 10, "")
	helm("upgrade", "--install", "uds-controller", chart, "--namespace", servingNamespace, "--wait")
	controllerConfig := rest.CopyConfig(cfg)
	controllerConfig.Impersonate = rest.ImpersonationConfig{UserName: "system:serviceaccount:uds-system:uds-controller"}
	controllerClient, err := kubernetes.NewForConfig(controllerConfig)
	if err != nil {
		t.Fatal(err)
	}
	manager, err := newServingManager(ctx, controllerClient)
	if err != nil {
		t.Fatal(err)
	}
	if err := manager.Synchronize(ctx); err != nil {
		t.Fatal(err)
	}
	if !manager.ready.Load() || manager.registered.Load() {
		t.Fatal("bootstrap activated or blocked serving readiness")
	}
	role, err := client.RbacV1().ClusterRoles().Get(ctx, "uds-controller", metav1.GetOptions{})
	if err != nil {
		t.Fatal(err)
	}
	stage(true, 10, role.UID)
	helm("upgrade", "uds-controller", chart, "--namespace", servingNamespace, "--wait")
	if err := manager.Synchronize(ctx); err != nil {
		t.Fatal(err)
	}
	secret, _ := client.CoreV1().Secrets(servingNamespace).Get(ctx, servingSecretName, metav1.GetOptions{})
	if secret.Annotations[activationOwnerAnnotation] != string(role.UID) {
		t.Fatal("activation not persisted")
	}
	for _, target := range registrationTargets {
		if target.mutating {
			obj, _ := client.AdmissionregistrationV1().MutatingWebhookConfigurations().Get(ctx, target.name, metav1.GetOptions{})
			err = client.AdmissionregistrationV1().MutatingWebhookConfigurations().Delete(ctx, target.name, metav1.DeleteOptions{Preconditions: &metav1.Preconditions{UID: &obj.UID}})
		} else {
			obj, _ := client.AdmissionregistrationV1().ValidatingWebhookConfigurations().Get(ctx, target.name, metav1.GetOptions{})
			err = client.AdmissionregistrationV1().ValidatingWebhookConfigurations().Delete(ctx, target.name, metav1.DeleteOptions{Preconditions: &metav1.Preconditions{UID: &obj.UID}})
		}
		if err != nil {
			t.Fatal(err)
		}
	}
	lookupChart := t.TempDir()
	if err := os.CopyFS(lookupChart, os.DirFS("../chart")); err != nil {
		t.Fatal(err)
	}
	entries, err := os.ReadDir(filepath.Join(lookupChart, "templates"))
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range entries {
		name := entry.Name()
		if strings.HasPrefix(name, "_") || name == "admission-registration.yaml" || name == "webhook.yaml" || name == "mutatingwebhook.yaml" || name == "mutating-webhook.yaml" {
			continue
		}
		if err := os.RemoveAll(filepath.Join(lookupChart, "templates", name)); err != nil {
			t.Fatal(err)
		}
	}
	renderActive := func() bool {
		t.Helper()
		output := helm("template", "uds-controller", lookupChart, "--namespace", servingNamespace, "--dry-run=server", "--set", "admission.register=false,nativeAdmission.enabled=false,nativeAdmission.narrowCallbacks=false")
		decoder := yamlutil.NewYAMLOrJSONDecoder(bytes.NewReader(output), 4096)
		for {
			var obj map[string]interface{}
			err := decoder.Decode(&obj)
			if err == io.EOF {
				break
			}
			if err != nil {
				t.Fatal(err)
			}
			meta, _ := obj["metadata"].(map[string]interface{})
			if obj["kind"] == "ConfigMap" && meta["name"] == registrationPlanName {
				return obj["data"].(map[string]interface{})["active"] == "true"
			}
		}
		t.Fatal("registration plan missing from render")
		return false
	}
	if !renderActive() {
		t.Fatal("bootstrap upgrade forgot activation after all callbacks were deleted")
	}
	restarted, err := newServingManager(ctx, controllerClient)
	if err != nil {
		t.Fatal(err)
	}
	if err := restarted.Synchronize(ctx); err != nil {
		t.Fatal("repair after restart failed", err)
	}
	if !restarted.registered.Load() {
		t.Fatal("registrations were not restored")
	}
	stage(true, 7, role.UID)
	helm("upgrade", "uds-controller", chart, "--namespace", servingNamespace, "--wait")
	if err := restarted.Synchronize(ctx); err != nil {
		t.Fatal("repaired objects prevented Helm update", err)
	}
	if err := client.RbacV1().ClusterRoles().Delete(ctx, role.Name, metav1.DeleteOptions{Preconditions: &metav1.Preconditions{UID: &role.UID}}); err != nil {
		t.Fatal(err)
	}
	if err := restarted.Synchronize(ctx); err == nil {
		t.Fatal("repair ignored deleted lifecycle owner")
	}
	if err := wait.PollUntilContextTimeout(ctx, 100*time.Millisecond, 15*time.Second, true, func(context.Context) (bool, error) {
		for _, target := range registrationTargets {
			if target.mutating {
				_, err = client.AdmissionregistrationV1().MutatingWebhookConfigurations().Get(ctx, target.name, metav1.GetOptions{})
			} else {
				_, err = client.AdmissionregistrationV1().ValidatingWebhookConfigurations().Get(ctx, target.name, metav1.GetOptions{})
			}
			if !apierrors.IsNotFound(err) {
				return false, err
			}
		}
		return true, nil
	}); err != nil {
		t.Fatal("repaired callbacks survived owner teardown", err)
	}
	if renderActive() {
		t.Fatal("retained serving Secret reactivated a removed installation")
	}
	replacement := role.DeepCopy()
	replacement.UID = ""
	replacement.ResourceVersion = ""
	replacement.ManagedFields = nil
	replacement.CreationTimestamp = metav1.Time{}
	replacement, err = client.RbacV1().ClusterRoles().Create(ctx, replacement, metav1.CreateOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if replacement.UID == role.UID || renderActive() {
		t.Fatal("new installation inherited the retired activation owner")
	}
	stale, err := newServingManager(ctx, client)
	if err != nil {
		t.Fatal(err)
	}
	if err := stale.Synchronize(ctx); err == nil {
		t.Fatal("stale active plan crossed installation identity")
	}
	stage(false, 7, replacement.UID)
	helm("upgrade", "uds-controller", chart, "--namespace", servingNamespace, "--wait")
	fresh, err := newServingManager(ctx, client)
	if err != nil {
		t.Fatal(err)
	}
	if err := fresh.Synchronize(ctx); err != nil {
		t.Fatal(err)
	}
	if fresh.registered.Load() {
		t.Fatal("new installation recreated callbacks before Helm activation")
	}
	t.Log("bootstrap stayed inactive; all five configurations repaired after restart; Helm SSA upgrade succeeded; teardown collected repairs; retained Secret did not activate a new role UID")
}
