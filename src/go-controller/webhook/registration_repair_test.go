// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package webhook

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	admissionv1 "k8s.io/api/admissionregistration/v1"
	corev1 "k8s.io/api/core/v1"
	rbacv1 "k8s.io/api/rbac/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/kubernetes/fake"
	ktesting "k8s.io/client-go/testing"
	"k8s.io/utils/ptr"
	"reflect"
	"testing"
)

func planFixture(t *testing.T, active bool) (*fake.Clientset, *corev1.ConfigMap) {
	t.Helper()
	ctx := context.Background()
	client, _ := servingFixture(t)
	annotations := map[string]string{"meta.helm.sh/release-name": "uds-controller", "meta.helm.sh/release-namespace": servingNamespace, "admissions.enforcer/disabled": "true"}
	objects := []interface{}{}
	for _, target := range registrationTargets {
		if target.mutating {
			obj, _ := client.AdmissionregistrationV1().MutatingWebhookConfigurations().Get(ctx, target.name, metav1.GetOptions{})
			obj.APIVersion = admissionv1.SchemeGroupVersion.String()
			obj.Kind = "MutatingWebhookConfiguration"
			obj.Annotations = annotations
			obj.UID = types.UID(target.name + "-mutating-original")
			for i := range obj.Webhooks {
				obj.Webhooks[i].SideEffects = ptr.To(admissionv1.SideEffectClassNone)
				obj.Webhooks[i].AdmissionReviewVersions = []string{"v1"}
			}
			client.AdmissionregistrationV1().MutatingWebhookConfigurations().Update(ctx, obj, metav1.UpdateOptions{})
			desired := obj.DeepCopy()
			desired.UID = ""
			desired.ResourceVersion = ""
			for i := range desired.Webhooks {
				desired.Webhooks[i].ClientConfig.CABundle = nil
			}
			objects = append(objects, desired)
		} else {
			obj, _ := client.AdmissionregistrationV1().ValidatingWebhookConfigurations().Get(ctx, target.name, metav1.GetOptions{})
			obj.APIVersion = admissionv1.SchemeGroupVersion.String()
			obj.Kind = "ValidatingWebhookConfiguration"
			obj.Annotations = annotations
			obj.UID = types.UID(target.name + "-validating-original")
			for i := range obj.Webhooks {
				obj.Webhooks[i].SideEffects = ptr.To(admissionv1.SideEffectClassNone)
				obj.Webhooks[i].AdmissionReviewVersions = []string{"v1"}
			}
			client.AdmissionregistrationV1().ValidatingWebhookConfigurations().Update(ctx, obj, metav1.UpdateOptions{})
			desired := obj.DeepCopy()
			desired.UID = ""
			desired.ResourceVersion = ""
			for i := range desired.Webhooks {
				desired.Webhooks[i].ClientConfig.CABundle = nil
			}
			objects = append(objects, desired)
		}
	}
	raw, _ := json.Marshal(map[string]interface{}{"items": objects})
	cm := &corev1.ConfigMap{ObjectMeta: metav1.ObjectMeta{Name: registrationPlanName, Namespace: servingNamespace, UID: "plan", ResourceVersion: "1", Annotations: annotations, ManagedFields: []metav1.ManagedFieldsEntry{{Manager: "helm", Operation: metav1.ManagedFieldsOperationApply, FieldsType: "FieldsV1", FieldsV1: &metav1.FieldsV1{Raw: []byte(`{"f:data":{"f:registrations.json":{}}}`)}}}}, Data: map[string]string{"ownerUID": "installation-one", "active": fmt.Sprint(active), "registrations.json": string(raw)}}
	if _, err := client.CoreV1().ConfigMaps(servingNamespace).Create(ctx, cm, metav1.CreateOptions{}); err != nil {
		t.Fatal(err)
	}
	if _, err := client.RbacV1().ClusterRoles().Create(ctx, &rbacv1.ClusterRole{ObjectMeta: metav1.ObjectMeta{Name: "uds-controller", UID: "installation-one", Annotations: annotations}}, metav1.CreateOptions{}); err != nil {
		t.Fatal(err)
	}
	return client, cm
}
func deleteRegistrations(t *testing.T, client *fake.Clientset) {
	t.Helper()
	for _, target := range registrationTargets {
		var err error
		if target.mutating {
			err = client.AdmissionregistrationV1().MutatingWebhookConfigurations().Delete(context.Background(), target.name, metav1.DeleteOptions{})
		} else {
			err = client.AdmissionregistrationV1().ValidatingWebhookConfigurations().Delete(context.Background(), target.name, metav1.DeleteOptions{})
		}
		if err != nil {
			t.Fatal(err)
		}
	}
}
func assertNoRegistrationCreates(t *testing.T, client *fake.Clientset) {
	t.Helper()
	for _, a := range client.Actions() {
		if a.GetVerb() == "create" && (a.GetResource().Resource == "validatingwebhookconfigurations" || a.GetResource().Resource == "mutatingwebhookconfigurations") {
			t.Fatal("bootstrap created admission authority")
		}
	}
}

func TestActivatedRegistrationsRepairAfterDeletionAndReplicaRestart(t *testing.T) {
	ctx := context.Background()
	client, _ := planFixture(t, true)
	manager, err := newServingManager(ctx, client)
	if err != nil {
		t.Fatal(err)
	}
	if err := manager.Synchronize(ctx); err != nil {
		t.Fatal(err)
	}
	secret, _ := client.CoreV1().Secrets(servingNamespace).Get(ctx, servingSecretName, metav1.GetOptions{})
	if secret.Annotations[activationOwnerAnnotation] != "installation-one" {
		t.Fatal("activation was not persisted")
	}
	plan, err := manager.loadRegistrationPlan(ctx, secret)
	if err != nil {
		t.Fatal(err)
	}
	deleteRegistrations(t, client)
	// No observed registrations remain; a newly started replica must use durable state.
	restarted, err := newServingManager(ctx, client)
	if err != nil {
		t.Fatal(err)
	}
	if err := restarted.Synchronize(ctx); err != nil {
		t.Fatal(err)
	}
	if !restarted.ready.Load() || !restarted.registered.Load() {
		t.Fatal("repaired callbacks did not restore readiness")
	}
	for _, target := range registrationTargets {
		var obj runtime.Object
		if target.mutating {
			obj, _ = client.AdmissionregistrationV1().MutatingWebhookConfigurations().Get(ctx, target.name, metav1.GetOptions{})
		} else {
			obj, _ = client.AdmissionregistrationV1().ValidatingWebhookConfigurations().Get(ctx, target.name, metav1.GetOptions{})
		}
		meta := obj.(metav1.Object)
		if len(meta.GetOwnerReferences()) != 1 || meta.GetOwnerReferences()[0].UID != "installation-one" {
			t.Fatal("repair missing lifecycle owner")
		}
		if !registrationMatchesPlan(obj, plan.objects[registrationKey(target.name, target.mutating)]) {
			t.Fatal("repair lost chart contract")
		}
		raw, _ := json.Marshal(obj)
		if !bytes.Contains(raw, []byte(`"admissions.enforcer/disabled":"true"`)) {
			t.Fatal("repair lost AKS compatibility annotation")
		}
	}
}

func TestBootstrapAndNewInstallationCannotInheritActivation(t *testing.T) {
	for _, oldMarker := range []string{"", "retired-installation"} {
		t.Run(oldMarker, func(t *testing.T) {
			client, _ := planFixture(t, false)
			deleteRegistrations(t, client)
			secret, _ := client.CoreV1().Secrets(servingNamespace).Get(context.Background(), servingSecretName, metav1.GetOptions{})
			secret.Annotations = map[string]string{activationOwnerAnnotation: oldMarker}
			client.CoreV1().Secrets(servingNamespace).Update(context.Background(), secret, metav1.UpdateOptions{})
			client.ClearActions()
			manager, err := newServingManager(context.Background(), client)
			if err != nil {
				t.Fatal(err)
			}
			if err := manager.Synchronize(context.Background()); err != nil {
				t.Fatal(err)
			}
			assertNoRegistrationCreates(t, client)
			if !manager.ready.Load() || manager.registered.Load() {
				t.Fatal("bootstrap backend must be Ready without activating callbacks")
			}
		})
	}
}

func TestActivationWaitsForCompleteRegistrationAndNeverAdoptsForeignObjects(t *testing.T) {
	ctx := context.Background()
	client, _ := planFixture(t, true)
	deleteRegistrations(t, client)
	client.ClearActions()
	manager, err := newServingManager(ctx, client)
	if err != nil {
		t.Fatal(err)
	}
	if err := manager.Synchronize(ctx); err != nil {
		t.Fatal(err)
	}
	assertNoRegistrationCreates(t, client)
	secret, _ := client.CoreV1().Secrets(servingNamespace).Get(ctx, servingSecretName, metav1.GetOptions{})
	if secret.Annotations[activationOwnerAnnotation] != "" {
		t.Fatal("repair armed before Helm completed activation")
	}
	client, _ = planFixture(t, true)
	foreign, _ := client.AdmissionregistrationV1().ValidatingWebhookConfigurations().Get(ctx, "uds-controller-pods", metav1.GetOptions{})
	foreign.Annotations = map[string]string{"meta.helm.sh/release-name": "someone-else"}
	client.AdmissionregistrationV1().ValidatingWebhookConfigurations().Update(ctx, foreign, metav1.UpdateOptions{})
	manager, _ = newServingManager(ctx, client)
	client.ClearActions()
	if err := manager.Synchronize(ctx); err == nil || manager.ready.Load() {
		t.Fatal("foreign callback accepted as Core authority")
	}
	for _, a := range client.Actions() {
		if a.GetVerb() == "patch" && a.GetResource().Resource == "validatingwebhookconfigurations" {
			t.Fatal("foreign callback was modified")
		}
	}
}

func TestUninstallDuringRepairDoesNotResurrectRegistration(t *testing.T) {
	ctx := context.Background()
	client, _ := planFixture(t, true)
	manager, _ := newServingManager(ctx, client)
	if err := manager.Synchronize(ctx); err != nil {
		t.Fatal(err)
	}
	secret, _ := client.CoreV1().Secrets(servingNamespace).Get(ctx, servingSecretName, metav1.GetOptions{})
	plan, err := manager.loadRegistrationPlan(ctx, secret)
	if err != nil {
		t.Fatal(err)
	}
	deleteRegistrations(t, client)
	client.RbacV1().ClusterRoles().Delete(ctx, "uds-controller", metav1.DeleteOptions{})
	client.ClearActions()
	if err := manager.repairRegistration(ctx, plan, secret, "uds-controller-pods", false, secret.Data["ca.crt"]); err == nil {
		t.Fatal("repair continued after owner deletion")
	}
	assertNoRegistrationCreates(t, client)
}

func TestRepairCreateRacePreservesForeignWinner(t *testing.T) {
	ctx := context.Background()
	client, _ := planFixture(t, true)
	manager, _ := newServingManager(ctx, client)
	if err := manager.Synchronize(ctx); err != nil {
		t.Fatal(err)
	}
	client.AdmissionregistrationV1().ValidatingWebhookConfigurations().Delete(ctx, "uds-controller-pods", metav1.DeleteOptions{})
	client.PrependReactor("create", "validatingwebhookconfigurations", func(action ktesting.Action) (bool, runtime.Object, error) {
		wanted := action.(ktesting.CreateAction).GetObject().(*admissionv1.ValidatingWebhookConfiguration)
		foreign := wanted.DeepCopy()
		foreign.Annotations = map[string]string{"meta.helm.sh/release-name": "foreign"}
		foreign.UID = "foreign-winner"
		if err := client.Tracker().Create(admissionv1.SchemeGroupVersion.WithResource("validatingwebhookconfigurations"), foreign, ""); err != nil {
			t.Fatal(err)
		}
		return false, nil, nil
	})
	if err := manager.Synchronize(ctx); err == nil {
		t.Fatal("foreign race winner was adopted")
	}
	got, _ := client.AdmissionregistrationV1().ValidatingWebhookConfigurations().Get(ctx, "uds-controller-pods", metav1.GetOptions{})
	if !reflect.DeepEqual(got.Annotations, map[string]string{"meta.helm.sh/release-name": "foreign"}) {
		t.Fatal("repair overwrote foreign ownership")
	}
}

func TestRepairUsesOverlappingTrustDuringRotation(t *testing.T) {
	ctx := context.Background()
	client, _ := planFixture(t, true)
	manager, _ := newServingManager(ctx, client)
	if err := manager.Synchronize(ctx); err != nil {
		t.Fatal(err)
	}
	secret, _ := client.CoreV1().Secrets(servingNamespace).Get(ctx, servingSecretName, metav1.GetOptions{})
	oldCA := bytes.Clone(secret.Data["ca.crt"])
	pair, newCA, err := generateSelfSignedCert()
	if err != nil {
		t.Fatal(err)
	}
	key, err := privateKeyPEM(pair)
	if err != nil {
		t.Fatal(err)
	}
	secret.Data = map[string][]byte{"tls.crt": newCA, "tls.key": key, "ca.crt": newCA}
	client.CoreV1().Secrets(servingNamespace).Update(ctx, secret, metav1.UpdateOptions{})
	deleteRegistrations(t, client)
	if err := manager.Synchronize(ctx); err != nil {
		t.Fatal(err)
	}
	config, _ := client.AdmissionregistrationV1().ValidatingWebhookConfigurations().Get(ctx, "uds-controller-pods", metav1.GetOptions{})
	bundle := config.Webhooks[0].ClientConfig.CABundle
	if !bytes.Contains(bundle, oldCA) || !bytes.Contains(bundle, newCA) {
		t.Fatal("repair lost old or new trust during rotation")
	}
	verifyReplicaCertificatesAt(t, client, manager.now(), manager)
}

func TestMalformedPlanCannotCreateExternalCallback(t *testing.T) {
	ctx := context.Background()
	client, cm := planFixture(t, true)
	manager, _ := newServingManager(ctx, client)
	if err := manager.Synchronize(ctx); err != nil {
		t.Fatal(err)
	}
	var list map[string]interface{}
	json.Unmarshal([]byte(cm.Data["registrations.json"]), &list)
	item := list["items"].([]interface{})[0].(map[string]interface{})
	hook := item["webhooks"].([]interface{})[0].(map[string]interface{})
	hook["clientConfig"].(map[string]interface{})["url"] = "https://foreign.invalid/admission"
	raw, _ := json.Marshal(list)
	cm.Data["registrations.json"] = string(raw)
	client.CoreV1().ConfigMaps(servingNamespace).Update(ctx, cm, metav1.UpdateOptions{})
	deleteRegistrations(t, client)
	client.ClearActions()
	if err := manager.Synchronize(ctx); err == nil || manager.ready.Load() {
		t.Fatal("malformed registration plan accepted")
	}
	assertNoRegistrationCreates(t, client)
}

func TestUnexpectedSelectorCannotSilentlyNarrowActivatedAdmission(t *testing.T) {
	ctx := context.Background()
	client, _ := planFixture(t, true)
	manager, _ := newServingManager(ctx, client)
	if err := manager.Synchronize(ctx); err != nil {
		t.Fatal(err)
	}
	config, _ := client.AdmissionregistrationV1().ValidatingWebhookConfigurations().Get(ctx, "uds-controller-pods", metav1.GetOptions{})
	config.Webhooks[0].ObjectSelector = &metav1.LabelSelector{MatchLabels: map[string]string{"bypass": "everything-else"}}
	client.AdmissionregistrationV1().ValidatingWebhookConfigurations().Update(ctx, config, metav1.UpdateOptions{})
	if err := manager.Synchronize(ctx); err == nil || manager.ready.Load() || manager.registered.Load() {
		t.Fatal("unexpected selector was accepted as an API default")
	}
}
