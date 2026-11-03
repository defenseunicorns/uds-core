// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package webhook

import (
	"context"
	"encoding/json"
	"fmt"
	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/apimachinery/pkg/util/sets"
	"k8s.io/client-go/util/csaupgrade"
	"k8s.io/utils/ptr"
	"log/slog"
)

func (m *ServingManager) repairRegistration(ctx context.Context, plan *registrationPlan, secret *corev1.Secret, name string, mutating bool, ca []byte) error {
	// Recheck authority immediately before CREATE. Role UID ownership also makes
	// Kubernetes collect a late repair if uninstall wins the subsequent race.
	cm, err := m.client.CoreV1().ConfigMaps(servingNamespace).Get(ctx, registrationPlanName, metav1.GetOptions{})
	if err != nil {
		return err
	}
	role, err := m.client.RbacV1().ClusterRoles().Get(ctx, plan.owner.Name, metav1.GetOptions{})
	if err != nil {
		return err
	}
	current, err := m.client.CoreV1().Secrets(servingNamespace).Get(ctx, servingSecretName, metav1.GetOptions{})
	if err != nil {
		return err
	}
	if cm.UID != plan.source.UID || cm.ResourceVersion != plan.source.ResourceVersion || role.UID != plan.owner.UID || role.DeletionTimestamp != nil || !sameRelease(role, cm) || current.UID != secret.UID || current.ResourceVersion != secret.ResourceVersion {
		return apierrors.NewConflict(schema.GroupResource{Resource: "configmaps"}, registrationPlanName, fmt.Errorf("admission repair authority changed"))
	}
	desired := plan.objects[registrationKey(name, mutating)]
	owner := metav1.OwnerReference{APIVersion: "rbac.authorization.k8s.io/v1", Kind: "ClusterRole", Name: role.Name, UID: role.UID, Controller: ptr.To(true)}
	meta := *desired.metadata().DeepCopy()
	meta.ResourceVersion = ""
	meta.UID = ""
	meta.ManagedFields = nil
	meta.OwnerReferences = []metav1.OwnerReference{owner}
	opts := metav1.CreateOptions{FieldManager: repairFieldManager}
	if mutating {
		obj := desired.mutating.DeepCopy()
		obj.ObjectMeta = meta
		for i := range obj.Webhooks {
			obj.Webhooks[i].ClientConfig.CABundle = ca
		}
		_, err = m.client.AdmissionregistrationV1().MutatingWebhookConfigurations().Create(ctx, obj, opts)
	} else {
		obj := desired.validating.DeepCopy()
		obj.ObjectMeta = meta
		for i := range obj.Webhooks {
			obj.Webhooks[i].ClientConfig.CABundle = ca
		}
		_, err = m.client.AdmissionregistrationV1().ValidatingWebhookConfigurations().Create(ctx, obj, opts)
	}
	if apierrors.IsAlreadyExists(err) {
		return nil
	} // another replica won; the next GET validates ownership
	if err == nil {
		slog.Info("Restored Core admission registration", "name", name, "mutating", mutating, "ownerUID", role.UID)
	}
	return err
}

func (m *ServingManager) activateRegistrationRepair(ctx context.Context, plan *registrationPlan, secret *corev1.Secret) error {
	if secret.Annotations[activationOwnerAnnotation] == string(plan.owner.UID) {
		return nil
	}
	raw, err := json.Marshal(map[string]interface{}{"metadata": map[string]interface{}{"uid": secret.UID, "resourceVersion": secret.ResourceVersion, "annotations": map[string]string{activationOwnerAnnotation: string(plan.owner.UID)}}})
	if err != nil {
		return err
	}
	_, err = m.client.CoreV1().Secrets(servingNamespace).Patch(ctx, servingSecretName, types.MergePatchType, raw, metav1.PatchOptions{})
	return err
}

// Convert only this repairer's CREATE ownership to the chart publisher's SSA
// manager using client-go's standard migration, with UID and RV preconditions.
// This also completes an interrupted repair on the next observation.
func handBackRegistration(obj runtime.Object, plan *registrationPlan) ([]byte, error) {
	patch, err := csaupgrade.UpgradeManagedFieldsPatch(obj, sets.New(repairFieldManager), plan.fieldManager)
	if err != nil || len(patch) == 0 {
		return patch, err
	}
	var operations []map[string]interface{}
	if err := json.Unmarshal(patch, &operations); err != nil {
		return nil, err
	}
	meta, ok := obj.(metav1.Object)
	if !ok {
		return nil, fmt.Errorf("registration has no metadata")
	}
	operations = append([]map[string]interface{}{{"op": "test", "path": "/metadata/uid", "value": meta.GetUID()}}, operations...)
	return json.Marshal(operations)
}
