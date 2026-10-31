// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package main

import (
	"encoding/json"
	"fmt"
	"os"
	"reflect"
	"strings"
)

func subset(want, have any) bool {
	switch w := want.(type) {
	case map[string]any:
		h, ok := have.(map[string]any)
		if !ok {
			if v, yes := have.(object); yes {
				h = map[string]any(v)
			} else {
				return false
			}
		}
		for k, v := range w {
			if !subset(v, h[k]) {
				return false
			}
		}
		return true
	case []any:
		h, ok := have.([]any)
		if !ok || len(w) != len(h) {
			return false
		}
		for i, v := range w {
			if !subset(v, h[i]) {
				return false
			}
		}
		return true
	default:
		return reflect.DeepEqual(want, have)
	}
}
func (c cluster) verify(contract string) error {
	raw, err := os.ReadFile(contract)
	if err != nil {
		return err
	}
	var list struct {
		Items []object `json:"items"`
	}
	if err = json.Unmarshal(raw, &list); err != nil {
		return err
	}
	if len(list.Items) != 27 {
		return fmt.Errorf("incomplete Core native admission contract")
	}
	if err = c.snapshot(); err != nil {
		return err
	}
	return poll(c.ctx, func() (bool, error) {
		for _, desired := range list.Items {
			kind := map[string]string{"ValidatingAdmissionPolicy": "validatingadmissionpolicies", "MutatingAdmissionPolicy": "mutatingadmissionpolicies", "ValidatingAdmissionPolicyBinding": "validatingadmissionpolicybindings", "MutatingAdmissionPolicyBinding": "mutatingadmissionpolicybindings", "MutatingWebhookConfiguration": "mutatingwebhookconfigurations", "ValidatingWebhookConfiguration": "validatingwebhookconfigurations"}[str(desired, "kind")]
			actual, err := c.get(kind, "", str(desired, "metadata", "name"))
			if err != nil {
				return false, err
			}
			if actual == nil {
				return false, nil
			}
			if strings.HasSuffix(str(desired, "kind"), "WebhookConfiguration") {
				ready, err := c.servingCAConverged(actual)
				if err != nil {
					return false, err
				}
				if !ready {
					return false, nil
				}
				stripServingCA(desired)
				stripServingCA(actual)
				if !subset(desired["webhooks"], actual["webhooks"]) {
					return false, nil
				}
			} else if !subset(get(desired, "spec"), get(actual, "spec")) {
				return false, nil
			}
			if warnings, ok := get(actual, "status", "typeChecking", "expressionWarnings").([]any); ok && len(warnings) > 0 {
				return false, fmt.Errorf("native policy %s has CEL type warnings", str(desired, "metadata", "name"))
			}
		}
		return c.canaries()
	})
}
func (c cluster) canaries() (bool, error) {
	parameters, err := c.get("admissionparameters.policy.uds.dev", "uds-policy-exemptions", "uds-native-grants")
	if err != nil {
		return false, err
	}
	pod := object{"apiVersion": "v1", "kind": "Pod", "metadata": object{"generateName": "uds-core-admission-probe-", "namespace": "default"}, "spec": object{"containers": []any{object{"name": "probe", "image": "registry.invalid/core-admission-probe:unused"}}}}
	raw, _ := json.Marshal(pod)
	response, err := c.kubectl(raw, "create", "--dry-run=server", "-f", "-", "-o=json")
	if err != nil {
		return false, err
	}
	var admitted object
	if err = json.Unmarshal(response, &admitted); err != nil {
		return false, err
	}
	if str(admitted, "metadata", "annotations", "policy.uds.dev/native-mutation-revision") != str(parameters, "spec", "revision") || get(admitted, "spec", "securityContext", "runAsNonRoot") != true {
		return false, nil
	}
	spec := pod["spec"].(object)
	containers := spec["containers"].([]any)
	containers[0].(object)["securityContext"] = object{"privileged": true}
	raw, _ = json.Marshal(pod)
	_, err = c.kubectl(raw, "create", "--dry-run=server", "-f", "-", "-o=json")
	if err == nil {
		return false, nil
	}
	if !strings.Contains(err.Error(), "uds-native-pod-profile") {
		return false, fmt.Errorf("native validation canary failed outside the expected CEL policy: %w", err)
	}
	return true, nil
}
