// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package main

import (
	"github.com/google/cel-go/cel"
	"testing"
)

func TestBootstrapFenceRootCAPublisherAndKCMCredentialBoundaries(t *testing.T) {
	documents, err := fenceDocuments("system:admin")
	if err != nil {
		t.Fatal(err)
	}
	spec := documents[0]["spec"].(map[string]interface{})
	validations := spec["validations"].([]interface{})
	expression := validations[0].(map[string]interface{})["expression"].(string)
	env, err := cel.NewEnv(cel.Variable("request", cel.DynType), cel.Variable("object", cel.DynType), cel.Variable("oldObject", cel.DynType))
	if err != nil {
		t.Fatal(err)
	}
	ast, issues := env.Compile(expression)
	if issues.Err() != nil {
		t.Fatal(issues.Err())
	}
	program, err := env.Program(ast)
	if err != nil {
		t.Fatal(err)
	}
	for _, test := range []struct {
		name, user, namespace, group, resource, subresource, operation, objectName string
		allowed                                                                    bool
	}{
		{"publisher-create", "system:serviceaccount:kube-system:root-ca-cert-publisher", "istio-system", "", "configmaps", "", "CREATE", "kube-root-ca.crt", true},
		{"publisher-update", "system:serviceaccount:kube-system:root-ca-cert-publisher", "uds-system", "", "configmaps", "", "UPDATE", "kube-root-ca.crt", true},
		{"publisher-tenant", "system:serviceaccount:kube-system:root-ca-cert-publisher", "tenant", "", "configmaps", "", "CREATE", "kube-root-ca.crt", false},
		{"publisher-other-map", "system:serviceaccount:kube-system:root-ca-cert-publisher", "istio-system", "", "configmaps", "", "CREATE", "udstrust", false},
		{"publisher-delete", "system:serviceaccount:kube-system:root-ca-cert-publisher", "istio-system", "", "configmaps", "", "DELETE", "kube-root-ca.crt", false},
		{"publisher-workload", "system:serviceaccount:kube-system:root-ca-cert-publisher", "istio-system", "apps", "deployments", "", "CREATE", "kube-root-ca.crt", false},
		{"other-sa-root-map", "system:serviceaccount:kube-system:other", "istio-system", "", "configmaps", "", "CREATE", "kube-root-ca.crt", false},
		{"istiod-signing-root", "system:serviceaccount:istio-system:istiod", "istio-system", "", "secrets", "", "CREATE", "istio-ca-secret", true},
		{"istiod-signing-update", "system:serviceaccount:istio-system:istiod", "istio-system", "", "secrets", "", "UPDATE", "istio-ca-secret", true},
		{"istiod-trust-publish", "system:serviceaccount:istio-system:istiod", "uds-system", "", "configmaps", "", "CREATE", "istio-ca-root-cert", true},
		{"istiod-secret-other-namespace", "system:serviceaccount:istio-system:istiod", "uds-system", "", "secrets", "", "CREATE", "istio-ca-secret", false},
		{"istiod-other-secret", "system:serviceaccount:istio-system:istiod", "istio-system", "", "secrets", "", "CREATE", "application-secret", false},
		{"istiod-secret-delete", "system:serviceaccount:istio-system:istiod", "istio-system", "", "secrets", "", "DELETE", "istio-ca-secret", false},
		{"istiod-tenant-root", "system:serviceaccount:istio-system:istiod", "tenant", "", "configmaps", "", "CREATE", "istio-ca-root-cert", false},
		{"other-actor-signing-root", "system:serviceaccount:istio-system:other", "istio-system", "", "secrets", "", "CREATE", "istio-ca-secret", false},
		{"istiod-main-election-create", "system:serviceaccount:istio-system:istiod", "istio-system", "", "configmaps", "", "CREATE", "istio-leader", true},
		{"istiod-ip-election-create", "system:serviceaccount:istio-system:istiod", "istio-system", "", "configmaps", "", "CREATE", "istio-ip-autoallocate", true},
		{"istiod-namespace-election-create", "system:serviceaccount:istio-system:istiod", "istio-system", "", "configmaps", "", "CREATE", "istio-namespace-controller-election", true},
		{"istiod-election-update", "system:serviceaccount:istio-system:istiod", "istio-system", "", "configmaps", "", "UPDATE", "istio-leader", true},
		{"istiod-election-delete", "system:serviceaccount:istio-system:istiod", "istio-system", "", "configmaps", "", "DELETE", "istio-leader", false},
		{"istiod-election-tenant", "system:serviceaccount:istio-system:istiod", "tenant", "", "configmaps", "", "CREATE", "istio-leader", false},
		{"istiod-election-other-infra", "system:serviceaccount:istio-system:istiod", "uds-system", "", "configmaps", "", "CREATE", "istio-leader", false},
		{"istiod-election-other-object", "system:serviceaccount:istio-system:istiod", "istio-system", "", "configmaps", "", "CREATE", "application-settings", false},
		{"istiod-election-other-group", "system:serviceaccount:istio-system:istiod", "istio-system", "apps", "configmaps", "", "CREATE", "istio-leader", false},
		{"istiod-election-other-subresource", "system:serviceaccount:istio-system:istiod", "istio-system", "", "configmaps", "status", "UPDATE", "istio-leader", false},
		{"other-actor-istio-election", "system:serviceaccount:istio-system:other", "istio-system", "", "configmaps", "", "CREATE", "istio-leader", false},
		{"kcm-controller-token", "system:kube-controller-manager", "kube-system", "", "serviceaccounts", "token", "CREATE", "horizontal-pod-autoscaler", true},
		{"kcm-root-ca-token", "system:kube-controller-manager", "kube-system", "", "serviceaccounts", "token", "CREATE", "root-ca-cert-publisher", true},
		{"kcm-token-cleaner-account-initialization", "system:kube-controller-manager", "kube-system", "", "serviceaccounts", "", "CREATE", "token-cleaner", true},
		{"kcm-controller-account-initialization", "system:kube-controller-manager", "kube-system", "", "serviceaccounts", "", "CREATE", "root-ca-cert-publisher", true},
		{"kcm-tenant-account", "system:kube-controller-manager", "tenant", "", "serviceaccounts", "", "CREATE", "token-cleaner", false},
		{"kcm-infra-non-system-account", "system:kube-controller-manager", "istio-system", "", "serviceaccounts", "", "CREATE", "token-cleaner", false},
		{"kcm-account-update", "system:kube-controller-manager", "kube-system", "", "serviceaccounts", "", "UPDATE", "token-cleaner", false},
		{"kcm-account-delete", "system:kube-controller-manager", "kube-system", "", "serviceaccounts", "", "DELETE", "token-cleaner", false},
		{"kcm-account-other-group", "system:kube-controller-manager", "kube-system", "apps", "serviceaccounts", "", "CREATE", "token-cleaner", false},
		{"other-actor-account-initialization", "system:serviceaccount:kube-system:other", "kube-system", "", "serviceaccounts", "", "CREATE", "token-cleaner", false},
		{"default-account-canary-namespace", "system:serviceaccount:kube-system:service-account-controller", "default", "", "serviceaccounts", "", "CREATE", "default", true},
		{"default-account-controller-namespace", "system:serviceaccount:kube-system:service-account-controller", "uds-system", "", "serviceaccounts", "", "CREATE", "default", true},
		{"default-account-mesh-namespace", "system:serviceaccount:kube-system:service-account-controller", "istio-system", "", "serviceaccounts", "", "CREATE", "default", true},
		{"default-account-config-only-crd-namespace", "system:serviceaccount:kube-system:service-account-controller", "uds-crds", "", "serviceaccounts", "", "CREATE", "default", true},
		{"default-account-tenant-denied", "system:serviceaccount:kube-system:service-account-controller", "tenant", "", "serviceaccounts", "", "CREATE", "default", false},
		{"default-account-other-name-denied", "system:serviceaccount:kube-system:service-account-controller", "uds-system", "", "serviceaccounts", "", "CREATE", "admin", false},
		{"default-account-update-denied", "system:serviceaccount:kube-system:service-account-controller", "uds-system", "", "serviceaccounts", "", "UPDATE", "default", false},
		{"default-account-delete-denied", "system:serviceaccount:kube-system:service-account-controller", "uds-system", "", "serviceaccounts", "", "DELETE", "default", false},
		{"default-account-subresource-denied", "system:serviceaccount:kube-system:service-account-controller", "uds-system", "", "serviceaccounts", "token", "CREATE", "default", false},
		{"default-account-other-group-denied", "system:serviceaccount:kube-system:service-account-controller", "uds-system", "apps", "serviceaccounts", "", "CREATE", "default", false},
		{"default-account-other-resource-denied", "system:serviceaccount:kube-system:service-account-controller", "uds-system", "", "secrets", "", "CREATE", "default", false},
		{"default-account-other-actor-denied", "system:serviceaccount:kube-system:other", "uds-system", "", "serviceaccounts", "", "CREATE", "default", false},
		{"default-account-crd-workload-denied", "system:serviceaccount:kube-system:service-account-controller", "uds-crds", "", "pods", "", "CREATE", "default", false},
		{"kcm-tenant-token", "system:kube-controller-manager", "tenant", "", "serviceaccounts", "token", "CREATE", "default", false},
		{"kcm-other-subresource", "system:kube-controller-manager", "kube-system", "", "serviceaccounts", "status", "CREATE", "root-ca-cert-publisher", false},
		{"kcm-update-token", "system:kube-controller-manager", "kube-system", "", "serviceaccounts", "token", "UPDATE", "root-ca-cert-publisher", false},
		{"kcm-other-group", "system:kube-controller-manager", "kube-system", "apps", "serviceaccounts", "token", "CREATE", "root-ca-cert-publisher", false},
		{"other-actor-token", "system:serviceaccount:kube-system:other", "kube-system", "", "serviceaccounts", "token", "CREATE", "root-ca-cert-publisher", false},
		{"kcm-tenant-deployment", "system:kube-controller-manager", "tenant", "apps", "deployments", "", "CREATE", "tenant", false},
		{"controller-infra-namespace-update", "system:serviceaccount:uds-system:uds-controller", "", "", "namespaces", "", "UPDATE", "uds-system", true},
		{"controller-keycloak-namespace-update", "system:serviceaccount:uds-system:uds-controller", "", "", "namespaces", "", "UPDATE", "keycloak", true},
		{"controller-envoy-namespace-update", "system:serviceaccount:uds-system:uds-controller", "", "", "namespaces", "", "UPDATE", "envoy-gateway-system", true},
		{"controller-default-envoy-namespace-update", "system:serviceaccount:uds-system:uds-controller", "", "", "namespaces", "", "UPDATE", "envoy-default-gateway", true},
		{"controller-default-envoy-gateway-update", "system:serviceaccount:uds-system:uds-controller", "envoy-default-gateway", "gateway.networking.k8s.io", "gateways", "", "UPDATE", "envoy-default-gateway", true},
		{"controller-tenant-gateway-denied", "system:serviceaccount:uds-system:uds-controller", "tenant", "gateway.networking.k8s.io", "gateways", "", "UPDATE", "envoy-default-gateway", false},
		{"controller-lookalike-envoy-namespace-denied", "system:serviceaccount:uds-system:uds-controller", "envoy-default-gateway-tenant", "gateway.networking.k8s.io", "gateways", "", "UPDATE", "envoy-default-gateway", false},
		{"tenant-cannot-author-default-envoy-gateway", "system:serviceaccount:tenant:uds-controller", "envoy-default-gateway", "gateway.networking.k8s.io", "gateways", "", "UPDATE", "envoy-default-gateway", false},
		{"default-account-envoy-control-namespace", "system:serviceaccount:kube-system:service-account-controller", "envoy-gateway-system", "", "serviceaccounts", "", "CREATE", "default", true},
		{"default-account-envoy-proxy-namespace", "system:serviceaccount:kube-system:service-account-controller", "envoy-default-gateway", "", "serviceaccounts", "", "CREATE", "default", true},
		{"controller-tenant-namespace-update", "system:serviceaccount:uds-system:uds-controller", "", "", "namespaces", "", "UPDATE", "tenant", false},
		{"controller-infra-namespace-create", "system:serviceaccount:uds-system:uds-controller", "", "", "namespaces", "", "CREATE", "uds-system", false},
		{"controller-infra-namespace-delete", "system:serviceaccount:uds-system:uds-controller", "", "", "namespaces", "", "DELETE", "uds-system", false},
		{"other-actor-infra-namespace-update", "system:serviceaccount:kube-system:other", "", "", "namespaces", "", "UPDATE", "uds-system", false},
	} {
		t.Run(test.name, func(t *testing.T) {
			request := map[string]interface{}{"userInfo": map[string]interface{}{"username": test.user}, "namespace": test.namespace, "operation": test.operation, "resource": map[string]interface{}{"group": test.group, "resource": test.resource}}
			if test.subresource != "" {
				request["subResource"] = test.subresource
			}
			if test.operation != "CREATE" {
				request["name"] = test.objectName
			}
			if test.resource == "namespaces" {
				delete(request, "namespace")
				delete(request, "name")
				delete(request["resource"].(map[string]interface{}), "group")
			}
			out, _, err := program.Eval(map[string]interface{}{"request": request, "object": map[string]interface{}{"metadata": map[string]interface{}{"name": test.objectName}}, "oldObject": nil})
			if err != nil {
				t.Fatal(err)
			}
			if out.Value() != test.allowed {
				t.Fatalf("allow decision %v, expected %v", out, test.allowed)
			}
		})
	}
}
