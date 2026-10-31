// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func fakeKube(t *testing.T, run func(interface{}, ...string) ([]byte, error)) {
	t.Helper()
	previous := kube
	kube = run
	t.Cleanup(func() { kube = previous })
}

func TestPreflightDoesNotTreatObservationFailureAsAbsence(t *testing.T) {
	kubeconfig := filepath.Join(t.TempDir(), "kubeconfig")
	if err := os.WriteFile(kubeconfig, []byte("test-context"), 0600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("KUBECONFIG", kubeconfig)
	diagnostic := errors.New("API unavailable")
	mutations := 0
	fakeKube(t, func(input interface{}, args ...string) ([]byte, error) {
		if input != nil {
			mutations++
		}
		if args[0] == "api-resources" {
			return []byte("validatingadmissionpolicies.admissionregistration.k8s.io\nvalidatingadmissionpolicybindings.admissionregistration.k8s.io\nmutatingadmissionpolicies.admissionregistration.k8s.io\nmutatingadmissionpolicybindings.admissionregistration.k8s.io"), nil
		}
		return nil, diagnostic
	})
	if err := preflight("system:admin"); !errors.Is(err, diagnostic) {
		t.Fatalf("observation error lost: %v", err)
	}
	if mutations != 0 {
		t.Fatal("bootstrap mutated cluster after failed observation")
	}
}

func TestGatewayPreflightRequiresPinnedChartBeforeBootstrapMutation(t *testing.T) {
	for _, tc := range []struct {
		name, key, value string
		allowed          bool
	}{
		{name: "installed pinned chart", allowed: true},
		{name: "old version", key: "gateway.networking.k8s.io/bundle-version", value: "v1.6.1"},
		{name: "unqualified version", key: "gateway.networking.k8s.io/bundle-version", value: "v9.0.0"},
		{name: "standard channel", key: "gateway.networking.k8s.io/channel", value: "standard"},
		{name: "foreign release", key: "meta.helm.sh/release-name", value: "foreign"},
		{name: "foreign namespace", key: "meta.helm.sh/release-namespace", value: "foreign"},
		{name: "missing ownership", key: "meta.helm.sh/release-name", value: ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			annotations := map[string]string{
				"gateway.networking.k8s.io/channel":        "experimental",
				"gateway.networking.k8s.io/bundle-version": gatewayAPIBundleVersion,
				"meta.helm.sh/release-name":                "gateway-api-crds",
				"meta.helm.sh/release-namespace":           "default",
			}
			if tc.key != "" {
				annotations[tc.key] = tc.value
			}
			fakeKube(t, func(input interface{}, args ...string) ([]byte, error) {
				if input != nil {
					t.Fatal("preflight wrote the cluster")
				}
				return json.Marshal(map[string]interface{}{"items": []interface{}{map[string]interface{}{
					"metadata": map[string]interface{}{"name": "gateways.gateway.networking.k8s.io", "annotations": annotations},
					"spec":     map[string]interface{}{"group": "gateway.networking.k8s.io"},
				}}})
			})
			err := gatewayPreflight()
			if (err == nil) != tc.allowed {
				t.Fatalf("preflight allowed=%v, error=%v", tc.allowed, err)
			}
			if err != nil && !strings.Contains(err.Error(), "conflicts") {
				t.Fatalf("unexpected error: %v", err)
			}
		})
	}
}

func TestBaseTrustStartsWithoutIdentityNamespaceOrSecret(t *testing.T) {
	fakeKube(t, func(input interface{}, args ...string) ([]byte, error) {
		if strings.Contains(strings.Join(args, " "), "keycloak") {
			t.Fatal("base bootstrap read absent identity")
		}
		if input != nil {
			obj := input.(map[string]interface{})
			if mapAt(obj, "metadata")["name"] == "keycloak" || mapAt(obj, "metadata")["name"] == "authservice" {
				t.Fatal("base bootstrap created identity resources")
			}
		}
		return nil, nil
	})
	if err := trust("uds.dev", "admin.uds.dev", false); err != nil {
		t.Fatal(err)
	}
}

func TestTrustDoesNotReplaceExistingSecretAfterFailedRead(t *testing.T) {
	diagnostic := errors.New("forbidden Secret read")
	fakeKube(t, func(input interface{}, args ...string) ([]byte, error) {
		if args[0] == "get" {
			return nil, diagnostic
		}
		if obj, ok := input.(map[string]interface{}); ok && obj["kind"] == "Secret" {
			t.Fatal("existing authority replaced after failed read")
		}
		return nil, nil
	})
	if err := trust("uds.dev", "admin.uds.dev", true); !errors.Is(err, diagnostic) {
		t.Fatalf("read error hidden: %v", err)
	}
}

func TestNativeActivationRequiresCompleteExactBindingSet(t *testing.T) {
	previous := readBuildLock
	t.Cleanup(func() { readBuildLock = previous })
	readBuildLock = func() ([]byte, error) {
		return []byte(`{"admissionBindings":[{"kind":"ValidatingAdmissionPolicyBinding","name":"uds-native-pod-profile","spec":{"policyName":"uds-native-pod-profile","validationActions":["Deny"],"paramRef":{"name":"uds-native-grants","namespace":"uds-policy-exemptions","parameterNotFoundAction":"Deny"}}},{"kind":"MutatingAdmissionPolicyBinding","name":"uds-native-defaults-profile","spec":{"policyName":"uds-native-defaults-profile"}}]}`), nil
	}
	for _, mode := range []string{"missing-second", "deny-weakened", "complete"} {
		t.Run(mode, func(t *testing.T) {
			fakeKube(t, func(input interface{}, args ...string) ([]byte, error) {
				if args[2] == "uds-native-defaults-profile" && mode == "missing-second" {
					return nil, nil
				}
				spec := map[string]interface{}{"policyName": args[2], "matchResources": map[string]interface{}{"matchPolicy": "Equivalent", "namespaceSelector": map[string]interface{}{}, "objectSelector": map[string]interface{}{}}}
				if strings.HasPrefix(args[1], "Validating") {
					spec["validationActions"] = []string{"Deny"}
					spec["paramRef"] = map[string]interface{}{"name": "uds-native-grants", "namespace": "uds-policy-exemptions", "parameterNotFoundAction": "Deny"}
					if mode == "deny-weakened" {
						spec["validationActions"] = []string{"Warn"}
					}
				}
				return json.Marshal(map[string]interface{}{"spec": spec})
			})
			err := nativeBindings()
			if (err == nil) != (mode == "complete") {
				t.Fatal(fmt.Sprintf("activation mode %s: %v", mode, err))
			}
		})
	}
}

func TestCandidateAndAbsentQualificationCannotOpenTenantFence(t *testing.T) {
	previous := readBuildLock
	t.Cleanup(func() { readBuildLock = previous })
	for _, entry := range []struct {
		data    string
		allowed bool
		invalid bool
	}{{`{"tenantActivationEnabled":false}`, false, false}, {`{}`, false, true}, {`{"tenantActivationEnabled":true}`, true, false}} {
		readBuildLock = func() ([]byte, error) { return []byte(entry.data), nil }
		allowed, err := tenantActivationAllowed()
		if allowed != entry.allowed || (err != nil) != entry.invalid {
			t.Fatalf("qualification %s returned %v/%v", entry.data, allowed, err)
		}
	}
}
