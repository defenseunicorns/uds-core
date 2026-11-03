// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package webhook

import (
	"context"
	"testing"

	admissionv1 "k8s.io/api/admissionregistration/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

func TestRegistrationReadinessRequiresNineFailClosedCallbacks(t *testing.T) {
	ctx := context.Background()
	client, _ := servingFixture(t)
	manager, err := newServingManager(ctx, client)
	if err != nil {
		t.Fatal(err)
	}
	state := &admissionServingState{manager: manager, ctx: ctx}
	state.listening.Store(true)
	previous := admissionState.Swap(state)
	defer admissionState.Store(previous)
	if err := manager.Synchronize(ctx); err != nil || !AdmissionRegistered() {
		t.Fatal("complete trusted registration did not report available", err)
	}
	config, err := client.AdmissionregistrationV1().ValidatingWebhookConfigurations().Get(ctx, "uds-controller-resources", metav1.GetOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if err := client.AdmissionregistrationV1().ValidatingWebhookConfigurations().Delete(ctx, config.Name, metav1.DeleteOptions{}); err != nil {
		t.Fatal(err)
	}
	if err := manager.Synchronize(ctx); err != nil || !AdmissionReady() || AdmissionRegistered() {
		t.Fatal("dormant backend was confused with registered authority", err)
	}
	if _, err := client.AdmissionregistrationV1().ValidatingWebhookConfigurations().Create(ctx, config, metav1.CreateOptions{}); err != nil {
		t.Fatal(err)
	}
	for _, mutation := range []func(*admissionv1.ValidatingWebhookConfiguration){
		func(c *admissionv1.ValidatingWebhookConfiguration) { c.Webhooks = c.Webhooks[:1] },
		func(c *admissionv1.ValidatingWebhookConfiguration) {
			ignore := admissionv1.Ignore
			c.Webhooks[0].FailurePolicy = &ignore
		},
		func(c *admissionv1.ValidatingWebhookConfiguration) {
			c.Webhooks[0].ClientConfig.Service.Name = "unrelated"
		},
		func(c *admissionv1.ValidatingWebhookConfiguration) {
			path := "/missing"
			c.Webhooks[0].ClientConfig.Service.Path = &path
		},
	} {
		changed := config.DeepCopy()
		mutation(changed)
		if _, err := client.AdmissionregistrationV1().ValidatingWebhookConfigurations().Update(ctx, changed, metav1.UpdateOptions{}); err != nil {
			t.Fatal(err)
		}
		if err := manager.Synchronize(ctx); err != nil || AdmissionRegistered() {
			t.Fatal("missing or weakened callback reported registered", err)
		}
	}
	if _, err := client.AdmissionregistrationV1().ValidatingWebhookConfigurations().Update(ctx, config, metav1.UpdateOptions{}); err != nil {
		t.Fatal(err)
	}
	if err := manager.Synchronize(ctx); err != nil || !AdmissionRegistered() {
		t.Fatal("restored complete registration did not recover", err)
	}
	state.listening.Store(false)
	if AdmissionRegistered() {
		t.Fatal("complete config reported availability after serving stopped")
	}
}
