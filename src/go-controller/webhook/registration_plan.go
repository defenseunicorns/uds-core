// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package webhook

import (
	"context"
	"encoding/json"
	"fmt"
	admissionv1 "k8s.io/api/admissionregistration/v1"
	corev1 "k8s.io/api/core/v1"
	rbacv1 "k8s.io/api/rbac/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"reflect"
	"slices"
)

const registrationPlanName = "uds-controller-admission-registration"
const activationOwnerAnnotation = "uds.dev/admission-activation-owner"
const repairFieldManager = "uds-controller-registration-repair"

var registrationTargets = []struct {
	name     string
	mutating bool
}{
	{webhookConfigName, false}, {"uds-controller-pods", false}, {"uds-controller-resources", false},
	{"uds-controller-pods", true}, {mutatingWebhookConfigName, true},
}

type plannedRegistration struct {
	validating *admissionv1.ValidatingWebhookConfiguration
	mutating   *admissionv1.MutatingWebhookConfiguration
}

func (r *plannedRegistration) metadata() *metav1.ObjectMeta {
	if r.mutating != nil {
		return &r.mutating.ObjectMeta
	}
	return &r.validating.ObjectMeta
}

type registrationPlan struct {
	source       *corev1.ConfigMap
	owner        *rbacv1.ClusterRole
	active       bool
	fieldManager string
	objects      map[string]*plannedRegistration
}

func registrationKey(name string, mutating bool) string { return fmt.Sprintf("%t/%s", mutating, name) }

func sameRelease(actual, desired metav1.Object) bool {
	a, d := actual.GetAnnotations(), desired.GetAnnotations()
	return d["meta.helm.sh/release-name"] != "" && a["meta.helm.sh/release-name"] == d["meta.helm.sh/release-name"] && a["meta.helm.sh/release-namespace"] == servingNamespace && d["meta.helm.sh/release-namespace"] == servingNamespace
}

func (m *ServingManager) loadRegistrationPlan(ctx context.Context, secret *corev1.Secret) (*registrationPlan, error) {
	cm, err := m.client.CoreV1().ConfigMaps(servingNamespace).Get(ctx, registrationPlanName, metav1.GetOptions{})
	if apierrors.IsNotFound(err) && secret.Annotations[activationOwnerAnnotation] == "" {
		return nil, nil
	} // pre-plan installation/bootstrap
	if err != nil {
		return nil, fmt.Errorf("read admission registration plan: %w", err)
	}
	if cm.DeletionTimestamp != nil || cm.UID == "" {
		return nil, fmt.Errorf("admission registration plan is being removed or has no identity")
	}
	role, err := m.client.RbacV1().ClusterRoles().Get(ctx, "uds-controller", metav1.GetOptions{})
	if err != nil {
		return nil, fmt.Errorf("read admission lifecycle owner: %w", err)
	}
	if role.UID == "" || role.DeletionTimestamp != nil || !sameRelease(role, cm) {
		return nil, fmt.Errorf("admission registration plan and lifecycle owner must belong to the same live Core release")
	}
	plan := &registrationPlan{source: cm, owner: role, objects: map[string]*plannedRegistration{}}
	switch cm.Data["active"] {
	case "true":
		plan.active = true
	case "false":
	default:
		return nil, fmt.Errorf("invalid admission activation intent")
	}
	publishedOwner := cm.Data["ownerUID"]
	activatedOwner := secret.Annotations[activationOwnerAnnotation]
	if plan.active && ((publishedOwner != "" && publishedOwner != string(role.UID)) || (activatedOwner != "" && activatedOwner != string(role.UID) && publishedOwner != string(role.UID))) {
		return nil, fmt.Errorf("admission registration plan belongs to a previous installation")
	}
	if !plan.active && secret.Annotations[activationOwnerAnnotation] == string(role.UID) {
		return nil, fmt.Errorf("activated admission cannot return to bootstrap")
	}
	var list struct {
		Items []json.RawMessage `json:"items"`
	}
	if err := json.Unmarshal([]byte(cm.Data["registrations.json"]), &list); err != nil {
		return nil, err
	}
	for _, raw := range list.Items {
		var meta metav1.TypeMeta
		if err := json.Unmarshal(raw, &meta); err != nil {
			return nil, err
		}
		if meta.APIVersion != admissionv1.SchemeGroupVersion.String() {
			return nil, fmt.Errorf("unsupported registration API %s", meta.APIVersion)
		}
		r := &plannedRegistration{}
		switch meta.Kind {
		case "ValidatingWebhookConfiguration":
			r.validating = &admissionv1.ValidatingWebhookConfiguration{}
			err = json.Unmarshal(raw, r.validating)
		case "MutatingWebhookConfiguration":
			r.mutating = &admissionv1.MutatingWebhookConfiguration{}
			err = json.Unmarshal(raw, r.mutating)
		default:
			return nil, fmt.Errorf("unsupported registration kind %s", meta.Kind)
		}
		if err != nil {
			return nil, err
		}
		key := registrationKey(r.metadata().Name, r.mutating != nil)
		known := false
		for _, target := range registrationTargets {
			known = known || key == registrationKey(target.name, target.mutating)
		}
		if !known || plan.objects[key] != nil || r.metadata().Namespace != "" || !sameRelease(r.metadata(), cm) {
			return nil, fmt.Errorf("foreign or duplicate registration in Core plan: %s", key)
		}
		if err := r.validate(); err != nil {
			return nil, err
		}
		plan.objects[key] = r
	}
	if len(plan.objects) != len(registrationTargets) {
		return nil, fmt.Errorf("incomplete admission registration plan")
	}
	// Derive Helm's actual manager (uds, zarf, or helm) from ownership of the plan
	// data. Repaired objects must not block subsequent server-side Helm upgrades.
	for _, entry := range cm.ManagedFields {
		if entry.FieldsV1 == nil || entry.Subresource != "" {
			continue
		}
		var fields map[string]map[string]json.RawMessage
		if json.Unmarshal(entry.FieldsV1.Raw, &fields) != nil {
			continue
		}
		if _, ok := fields["f:data"]["f:registrations.json"]; !ok {
			continue
		}
		if plan.fieldManager != "" && plan.fieldManager != entry.Manager {
			return nil, fmt.Errorf("ambiguous admission plan field ownership")
		}
		plan.fieldManager = entry.Manager
	}
	if plan.active && plan.fieldManager == "" {
		return nil, fmt.Errorf("admission plan has no publishing field manager")
	}
	return plan, nil
}

func (r *plannedRegistration) validate() error {
	expected := expectedCallbacks(r.metadata().Name, r.mutating != nil)
	check := func(name string, policy *admissionv1.FailurePolicyType, client admissionv1.WebhookClientConfig, sideEffects *admissionv1.SideEffectClass, versions []string) error {
		if !callbackMatches(name, policy, client.Service, expected) || client.URL != nil || sideEffects == nil || *sideEffects != admissionv1.SideEffectClassNone || !slices.Contains(versions, "v1") {
			return fmt.Errorf("invalid planned Core callback %s", name)
		}
		delete(expected, name)
		return nil
	}
	if r.mutating != nil {
		for _, h := range r.mutating.Webhooks {
			if err := check(h.Name, h.FailurePolicy, h.ClientConfig, h.SideEffects, h.AdmissionReviewVersions); err != nil {
				return err
			}
		}
	} else {
		for _, h := range r.validating.Webhooks {
			if err := check(h.Name, h.FailurePolicy, h.ClientConfig, h.SideEffects, h.AdmissionReviewVersions); err != nil {
				return err
			}
		}
	}
	if len(expected) != 0 {
		return fmt.Errorf("incomplete callbacks for %s", r.metadata().Name)
	}
	return nil
}

// Compare the complete webhook contract, normalizing only Kubernetes v1's
// documented defaults. Extra selectors/conditions must not silently narrow scope.
func registrationMatchesPlan(actual interface{}, desired *plannedRegistration) bool {
	if desired == nil {
		return false
	}
	var want interface{} = desired.validating
	if desired.mutating != nil {
		want = desired.mutating
	}
	a, err := normalizedRegistrationHooks(want, desired.mutating != nil)
	if err != nil {
		return false
	}
	b, err := normalizedRegistrationHooks(actual, desired.mutating != nil)
	if err != nil {
		return false
	}
	return reflect.DeepEqual(a, b)
}

func normalizedRegistrationHooks(obj interface{}, mutating bool) ([]interface{}, error) {
	raw, err := json.Marshal(obj)
	if err != nil {
		return nil, err
	}
	var decoded map[string]interface{}
	if err := json.Unmarshal(raw, &decoded); err != nil {
		return nil, err
	}
	hooks, ok := decoded["webhooks"].([]interface{})
	if !ok {
		return nil, fmt.Errorf("missing webhook definitions")
	}
	for _, value := range hooks {
		hook := value.(map[string]interface{})
		defaults := map[string]interface{}{"failurePolicy": "Fail", "matchPolicy": "Equivalent", "namespaceSelector": map[string]interface{}{}, "objectSelector": map[string]interface{}{}, "timeoutSeconds": float64(10)}
		if mutating {
			defaults["reinvocationPolicy"] = "Never"
		}
		for key, value := range defaults {
			if hook[key] == nil {
				hook[key] = value
			}
		}
		client := hook["clientConfig"].(map[string]interface{})
		delete(client, "caBundle")
		if service, ok := client["service"].(map[string]interface{}); ok && service["port"] == nil {
			service["port"] = float64(443)
		}
		if rules, ok := hook["rules"].([]interface{}); ok {
			for _, value := range rules {
				rule := value.(map[string]interface{})
				if rule["scope"] == nil {
					rule["scope"] = "*"
				}
			}
		}
	}
	return hooks, nil
}
