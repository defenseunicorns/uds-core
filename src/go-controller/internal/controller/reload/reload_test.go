// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package reload

import (
	"context"
	"errors"
	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/kubernetes/fake"
	ktesting "k8s.io/client-go/testing"
	"k8s.io/utils/ptr"
	"strings"
	"testing"
)

func TestReferencesIncludesProjectedAndInitContainerInputs(t *testing.T) {
	pod := corev1.PodSpec{Volumes: []corev1.Volume{{VolumeSource: corev1.VolumeSource{Projected: &corev1.ProjectedVolumeSource{Sources: []corev1.VolumeProjection{{Secret: &corev1.SecretProjection{LocalObjectReference: corev1.LocalObjectReference{Name: "credentials"}}}}}}}}, InitContainers: []corev1.Container{{EnvFrom: []corev1.EnvFromSource{{ConfigMapRef: &corev1.ConfigMapEnvSource{LocalObjectReference: corev1.LocalObjectReference{Name: "settings"}}}}}}}
	if !References(pod, "Secret", "credentials") || !References(pod, "ConfigMap", "settings") {
		t.Fatal("projected/init consumers were missed")
	}
	if References(pod, "Secret", "other") {
		t.Fatal("unrelated resource matched")
	}
}

func TestReloadRollsDeploymentOnceAndRetriesFailure(t *testing.T) {
	ctx := context.Background()
	deployment := &appsv1.Deployment{ObjectMeta: metav1.ObjectMeta{Name: "app", Namespace: "test", UID: "deployment"}}
	rs := &appsv1.ReplicaSet{ObjectMeta: metav1.ObjectMeta{Name: "app-rs", Namespace: "test", UID: "rs", OwnerReferences: []metav1.OwnerReference{{Kind: "Deployment", Name: "app", UID: "deployment", Controller: ptr.To(true)}}}}
	client := fake.NewClientset(deployment, rs)
	ref := metav1.OwnerReference{Kind: "ReplicaSet", Name: "app-rs", UID: "rs", Controller: ptr.To(true)}
	pods := []corev1.Pod{{ObjectMeta: metav1.ObjectMeta{Name: "app-1", OwnerReferences: []metav1.OwnerReference{ref}}}, {ObjectMeta: metav1.ObjectMeta{Name: "app-2", OwnerReferences: []metav1.OwnerReference{ref}}}}
	fail := true
	client.PrependReactor("patch", "deployments", func(action ktesting.Action) (bool, runtime.Object, error) {
		if fail {
			return true, nil, errors.New("temporary patch rejection")
		}
		return false, nil, nil
	})
	token := "Secret/settings/resource-uid/checksum"
	if err := ReloadPods(ctx, client, "test", pods, "Secret settings change", "SecretChanged", token); err == nil {
		t.Fatal("patch failure was hidden")
	}
	fail = false
	if err := ReloadPods(ctx, client, "test", pods, "Secret settings change", "SecretChanged", token); err != nil {
		t.Fatal(err)
	}
	got, _ := client.AppsV1().Deployments("test").Get(ctx, "app", metav1.GetOptions{})
	if got.Spec.Template.Annotations["uds.dev/restartedAt"] == "" {
		t.Fatal("Deployment did not roll")
	}
	events, _ := client.CoreV1().Events("test").List(ctx, metav1.ListOptions{})
	if len(events.Items) != 1 || events.Items[0].Reason != "SecretChanged" || !strings.Contains(events.Items[0].Message, "settings") {
		t.Fatalf("reload event missing: %#v", events.Items)
	}
	client.ClearActions()
	if err := ReloadPods(ctx, client, "test", pods, "Secret settings change", "SecretChanged", token); err != nil {
		t.Fatal(err)
	}
	for _, action := range client.Actions() {
		if action.GetVerb() == "patch" {
			t.Fatal("same resource revision rolled twice")
		}
	}
}

func TestSelectorValidationAndChecksumStability(t *testing.T) {
	if _, err := ParseSelector("app=demo,role=frontend"); err != nil {
		t.Fatal(err)
	}
	for _, value := range []string{"app=", "=demo", "app=demo,broken", "app=demo=more"} {
		if _, err := ParseSelector(value); err == nil {
			t.Fatalf("invalid selector accepted: %s", value)
		}
	}
	first, _ := dataRequest(&corev1.Secret{Data: map[string][]byte{"a": []byte("one"), "b": []byte("two")}})
	second, _ := dataRequest(&corev1.Secret{Data: map[string][]byte{"b": []byte("two"), "a": []byte("one")}})
	if first.Token != second.Token {
		t.Fatal("map iteration changed checksum")
	}
}
