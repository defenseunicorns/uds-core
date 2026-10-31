// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strings"
	"time"
)

func gate(phase string, identity bool) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()
	for {
		err := gateOnce(phase, identity)
		if err == nil {
			return nil
		}
		select {
		case <-ctx.Done():
			return fmt.Errorf("native %s gate did not converge: %w", phase, err)
		case <-time.After(time.Second):
		}
	}
}

func gateOnce(phase string, identity bool) error {
	if _, err := kube(nil, "rollout", "status", "deployment/uds-controller", "-n", "uds-system", "--timeout=120s"); err != nil {
		return err
	}
	params, err := get("admissionparameters.policy.uds.dev", "uds-policy-exemptions", "uds-native-grants")
	if err != nil {
		return err
	}
	spec := mapAt(params, "spec")
	if spec["valid"] != true || spec["revision"] == "bootstrap-empty" || spec["revision"] == nil {
		return errors.New("native admission compiler has no valid current authority snapshot")
	}
	if phase == "backend" {
		return nil
	}
	for _, entry := range []struct{ kind, name string }{{"validatingwebhookconfiguration", "uds-controller-clusterconfig"}, {"validatingwebhookconfiguration", "uds-controller-pods"}, {"validatingwebhookconfiguration", "uds-controller-resources"}, {"mutatingwebhookconfiguration", "uds-controller-waypoint"}, {"mutatingwebhookconfiguration", "uds-controller-pods"}} {
		if _, err := get(entry.kind, "", entry.name); err != nil {
			return err
		}
	}
	if phase == "callbacks" {
		return callbackCanary()
	}
	if identity {
		if _, err := kube(nil, "rollout", "status", "statefulset/keycloak", "-n", "keycloak", "--timeout=120s"); err != nil {
			return err
		}
		if _, err := kube(nil, "rollout", "status", "deployment/authservice", "-n", "authservice", "--timeout=120s"); err != nil {
			return err
		}
		for _, name := range []string{"keycloak", "authservice", "uds-controller"} {
			ns := name
			if name == "uds-controller" {
				ns = "uds-system"
			}
			pkg, err := get("package", ns, name)
			if err != nil {
				return err
			}
			if mapAt(pkg, "status")["phase"] != "Ready" {
				return fmt.Errorf("Package %s is not Ready", name)
			}
		}
	}
	if phase == "identity" {
		return callbackCanary()
	}
	if phase != "native" {
		return errors.New("unknown gate phase")
	}
	if err := nativeBindings(); err != nil {
		return err
	}
	return callbackCanary()
}

var readBuildLock = func() ([]byte, error) { return os.ReadFile("native-dev-build-lock.json") }

func nativeBindings() error {
	data, err := readBuildLock()
	if err != nil {
		return err
	}
	var lock struct {
		AdmissionBindings []struct {
			Kind, Name string
			Spec       map[string]interface{}
		} `json:"admissionBindings"`
	}
	if err := json.Unmarshal(data, &lock); err != nil {
		return err
	}
	if len(lock.AdmissionBindings) == 0 {
		return errors.New("native binding expectations missing from build lock")
	}
	for _, expected := range lock.AdmissionBindings {
		actual, err := get(expected.Kind, "", expected.Name)
		if err != nil {
			return err
		}
		want, err := json.Marshal(bindingDefaults(expected.Spec))
		if err != nil {
			return err
		}
		have, err := json.Marshal(bindingDefaults(mapAt(actual, "spec")))
		if err != nil {
			return err
		}
		if string(want) != string(have) {
			return fmt.Errorf("native binding %s does not match the compiled activation contract", expected.Name)
		}
	}
	return nil
}

func bindingDefaults(spec map[string]interface{}) map[string]interface{} {
	match := mapAt(spec, "matchResources")
	if match == nil {
		match = map[string]interface{}{}
		spec["matchResources"] = match
	}
	for key, value := range map[string]interface{}{"matchPolicy": "Equivalent", "objectSelector": map[string]interface{}{}, "namespaceSelector": map[string]interface{}{}} {
		if _, exists := match[key]; !exists {
			match[key] = value
		}
	}
	return spec
}
func callbackCanary() error {
	// The installer passes the temporary authoring fence but has no native
	// controller recovery exception. Probe native tenant and Go fallback scopes.
	for _, namespace := range []string{"default", "uds-system"} {
		if err := canaryInNamespace(namespace); err != nil {
			return fmt.Errorf("%s admission canary: %w", namespace, err)
		}
	}
	return nil
}

func canaryInNamespace(namespace string) error {
	pod := object("Pod", "native-admission-canary", namespace)
	pod["spec"] = map[string]interface{}{"containers": []interface{}{map[string]interface{}{"name": "canary", "image": "invalid.example/never-pulled:canary", "securityContext": map[string]interface{}{"privileged": true}}}}
	_, err := kube(pod, "create", "--dry-run=server", "-f", "-")
	if err == nil {
		return errors.New("invalid ordinary Pod was admitted")
	}
	if !strings.Contains(err.Error(), "privileged") {
		return fmt.Errorf("admission deny canary did not reach policy enforcement: %w", err)
	}
	valid := object("Pod", "native-admission-defaults-canary", namespace)
	valid["spec"] = map[string]interface{}{"containers": []interface{}{map[string]interface{}{"name": "canary", "image": "invalid.example/never-pulled:canary"}}}
	mutated, err := kube(valid, "create", "--dry-run=server", "-f", "-", "-o", "json")
	if err != nil {
		return fmt.Errorf("valid mutation canary rejected: %w", err)
	}
	var result map[string]interface{}
	if err := json.Unmarshal(mutated, &result); err != nil {
		return err
	}
	security := mapAt(result, "spec", "securityContext")
	if security["runAsNonRoot"] != true {
		return errors.New("native mutation did not supply non-root default")
	}
	return nil
}
func finish(identity bool) error {
	if err := gate("native", identity); err != nil {
		return err
	}
	if !identity {
		fmt.Println("Native backend and admission are ready; tenant authoring remains fenced until identity readiness")
		return nil
	}
	for _, entry := range []struct{ namespace, name string }{{"istio-admin-gateway", "admin-ingressgateway"}, {"istio-tenant-gateway", "tenant-ingressgateway"}} {
		if _, err := kube(nil, "rollout", "status", "deployment/"+entry.name, "-n", entry.namespace, "--timeout=120s"); err != nil {
			return err
		}
	}
	allowed, err := tenantActivationAllowed()
	if err != nil {
		return err
	}
	if !allowed {
		fmt.Println("Native cold-start candidate gates passed; tenant authoring remains fenced for qualification")
		return nil
	}
	_, err = kube(nil, "delete", "validatingadmissionpolicybinding", fence, "--ignore-not-found")
	return err
}

func tenantActivationAllowed() (bool, error) {
	data, err := readBuildLock()
	if err != nil {
		return false, err
	}
	var lock struct {
		Enabled *bool `json:"tenantActivationEnabled"`
	}
	if err := json.Unmarshal(data, &lock); err != nil {
		return false, err
	}
	if lock.Enabled == nil {
		return false, errors.New("tenant activation qualification missing from build lock")
	}
	return *lock.Enabled, nil
}
