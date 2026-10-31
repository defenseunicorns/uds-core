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
)

var infrastructure = []string{"kube-system", "kube-public", "kube-node-lease", "default", "zarf", "pepr-system", "uds-policy-exemptions", "istio-system", "uds-system", "authservice", "monitoring", "keycloak", "keycloak-dex-public", "keycloak-dex-admin", "istio-egress-ambient", "istio-egress-gateway", "istio-admin-gateway", "istio-tenant-gateway", "envoy-gateway-system", "envoy-default-gateway"}

const fence = "uds-native-dev-bootstrap-fence"
const gatewayAPIBundleVersion = "v1.6.3"

func preflight(installer string) error {
	// A development profile must never select another cluster through ambient
	// kubectl configuration. Zarf and every imported action inherit this path.
	kubeconfig := os.Getenv("KUBECONFIG")
	if !filepath.IsAbs(kubeconfig) || strings.Contains(kubeconfig, string(os.PathListSeparator)) {
		return errors.New("cold deployment requires one explicit absolute KUBECONFIG")
	}
	if _, err := os.Stat(kubeconfig); err != nil {
		return fmt.Errorf("read explicit bootstrap kubeconfig: %w", err)
	}
	resources, err := kube(nil, "api-resources", "--api-group=admissionregistration.k8s.io", "-o", "name")
	if err != nil {
		return err
	}
	for _, kind := range []string{"validatingadmissionpolicies", "validatingadmissionpolicybindings", "mutatingadmissionpolicies", "mutatingadmissionpolicybindings"} {
		if !strings.Contains(string(resources), kind+".admissionregistration.k8s.io") {
			return fmt.Errorf("missing native capability %s", kind)
		}
	}
	for _, name := range []string{"pepr-uds-core", "pepr-uds-core-watcher"} {
		if _, err := get("deployment", "pepr-system", name); err == nil {
			return fmt.Errorf("Pepr %s already exists; use an explicit handoff instead", name)
		} else if !errors.Is(err, errNotFound) {
			return err
		}
	}
	if err := gatewayPreflight(); err != nil {
		return err
	}
	caller, err := kube(nil, "auth", "whoami", "-o", "json")
	if err != nil {
		return err
	}
	var identity map[string]interface{}
	if err := json.Unmarshal(caller, &identity); err != nil {
		return err
	}
	if mapAt(identity, "status", "userInfo")["username"] != installer {
		return errors.New("NATIVE_BOOTSTRAP_USER must match the authenticated package installer")
	}
	documents, err := fenceDocuments(installer)
	if err != nil {
		return err
	}
	for _, document := range documents {
		if err := apply(document); err != nil {
			return err
		}
	}
	return nil
}

func gatewayPreflight() error {
	data, err := kube(nil, "get", "customresourcedefinitions", "-o", "json")
	if err != nil {
		return err
	}
	var list struct {
		Items []map[string]interface{} `json:"items"`
	}
	if err := json.Unmarshal(data, &list); err != nil {
		return err
	}
	for _, crd := range list.Items {
		group := mapAt(crd, "spec")["group"]
		if group != "gateway.networking.k8s.io" && group != "gateway.networking.x-k8s.io" {
			continue
		}
		annotations := mapAt(crd, "metadata", "annotations")
		if annotations["gateway.networking.k8s.io/channel"] != "experimental" || annotations["gateway.networking.k8s.io/bundle-version"] != gatewayAPIBundleVersion || annotations["meta.helm.sh/release-name"] != "gateway-api-crds" || annotations["meta.helm.sh/release-namespace"] != "default" {
			return fmt.Errorf("Gateway API %v conflicts with the pinned experimental %s chart; cold boot must disable preinstalled Gateway API CRDs", mapAt(crd, "metadata")["name"], gatewayAPIBundleVersion)
		}
	}
	return nil
}

func fenceDocuments(installer string) ([]map[string]interface{}, error) {
	if strings.TrimSpace(installer) == "" || strings.HasPrefix(installer, "system:node:") {
		return nil, errors.New("an explicit bootstrap installer identity is required")
	}
	namespaces, _ := json.Marshal(infrastructure)
	// The signed CRD chart also creates its config-only uds-crds namespace.
	// Include it only for the real default-SA publisher, not general authoring.
	defaultAccountNamespaces, _ := json.Marshal(append(append([]string(nil), infrastructure...), "uds-crds"))
	who, _ := json.Marshal(installer)
	controller := "request.userInfo.username=='system:serviceaccount:uds-system:uds-controller'"
	identity := "(has(request.namespace)&&request.namespace=='keycloak'&&request.resource.resource=='secrets'&&request.userInfo.username=='system:serviceaccount:keycloak:uds-native-identity')"
	builtin := "request.userInfo.username in ['system:kube-controller-manager','system:serviceaccount:kube-system:daemon-set-controller','system:serviceaccount:kube-system:deployment-controller','system:serviceaccount:kube-system:statefulset-controller','system:serviceaccount:kube-system:replicaset-controller','system:serviceaccount:kube-system:replication-controller','system:serviceaccount:kube-system:job-controller','system:serviceaccount:kube-system:cronjob-controller','system:serviceaccount:kube-system:generic-garbage-collector']"
	scoped := "has(request.namespace)&&request.namespace in " + string(namespaces)
	controllerNamespace := "(" + controller + "&&(!has(request.resource.group)||request.resource.group=='')&&request.resource.resource=='namespaces'&&(!has(request.subResource)||request.subResource=='')&&request.operation=='UPDATE'&&object!=null&&has(object.metadata)&&has(object.metadata.name)&&object.metadata.name in " + string(namespaces) + ")"
	owned := func(value string) string {
		return "(" + value + "!=null&&has(" + value + ".metadata)&&has(" + value + ".metadata.ownerReferences)&&" + value + ".metadata.ownerReferences.exists(o,has(o.controller)&&o.controller))"
	}
	owner := "(" + owned("object") + "||" + owned("oldObject") + ")"
	// Istiod's generated waypoint objects carry a Gateway owner without the
	// controller boolean. Permit only the two prerequisite Gateway identities.
	gatewayOwner := func(value string) string {
		return "(" + value + "!=null&&has(request.namespace)&&has(" + value + ".metadata)&&has(" + value + ".metadata.ownerReferences)&&" + value + ".metadata.ownerReferences.exists(o,o.apiVersion=='gateway.networking.k8s.io/v1'&&o.kind=='Gateway'&&((request.namespace=='keycloak'&&o.name=='keycloak-waypoint')||(request.namespace=='istio-egress-ambient'&&o.name=='egress-waypoint'))))"
	}
	mesh := "(request.userInfo.username=='system:serviceaccount:istio-system:istiod'&&request.resource.resource in ['deployments','services','serviceaccounts']&&(" + gatewayOwner("object") + "||" + gatewayOwner("oldObject") + "))"
	// Envoy's four generated proxy objects use a Gateway owner reference without
	// the controller boolean. Only the authenticated upstream controller may
	// create/update these exact default-Gateway children while tenants are fenced.
	envoy := "(request.userInfo.username=='system:serviceaccount:envoy-gateway-system:envoy-gateway'&&has(request.namespace)&&request.namespace=='envoy-default-gateway'&&request.operation in ['CREATE','UPDATE']&&(!has(request.subResource)||request.subResource=='')&&((has(request.resource.group)&&request.resource.group=='apps'&&request.resource.resource=='deployments')||((!has(request.resource.group)||request.resource.group=='')&&request.resource.resource in ['services','serviceaccounts','configmaps']))&&object!=null&&has(object.metadata)&&has(object.metadata.name)&&object.metadata.name=='envoy-default-gateway'&&has(object.metadata.ownerReferences)&&object.metadata.ownerReferences.exists(o,o.apiVersion=='gateway.networking.k8s.io/v1'&&o.kind=='Gateway'&&o.name=='envoy-default-gateway'))"
	// Primary requests omit the optional subResource key. Match the authenticated
	// publisher's actual object name, never a guessed collection CREATE URL name.
	rootCA := "(request.userInfo.username=='system:serviceaccount:kube-system:root-ca-cert-publisher'&&(!has(request.resource.group)||request.resource.group=='')&&request.resource.resource=='configmaps'&&(!has(request.subResource)||request.subResource=='')&&object!=null&&has(object.metadata)&&has(object.metadata.name)&&object.metadata.name=='kube-root-ca.crt'&&request.operation in ['CREATE','UPDATE'])"
	istioCA := "(request.userInfo.username=='system:serviceaccount:istio-system:istiod'&&(!has(request.resource.group)||request.resource.group=='')&&(!has(request.subResource)||request.subResource=='')&&object!=null&&has(object.metadata)&&has(object.metadata.name)&&request.operation in ['CREATE','UPDATE']&&((has(request.namespace)&&request.namespace=='istio-system'&&request.resource.resource=='secrets'&&object.metadata.name=='istio-ca-secret')||(request.resource.resource=='configmaps'&&object.metadata.name=='istio-ca-root-cert')))"
	istioElection := "(request.userInfo.username=='system:serviceaccount:istio-system:istiod'&&(!has(request.resource.group)||request.resource.group=='')&&request.resource.resource=='configmaps'&&(!has(request.subResource)||request.subResource=='')&&request.operation in ['CREATE','UPDATE']&&has(request.namespace)&&request.namespace=='istio-system'&&object!=null&&has(object.metadata)&&has(object.metadata.name)&&object.metadata.name in ['istio-leader','istio-ip-autoallocate','istio-namespace-controller-election'])"
	kcmToken := "(request.userInfo.username=='system:kube-controller-manager'&&(!has(request.resource.group)||request.resource.group=='')&&request.resource.resource=='serviceaccounts'&&has(request.subResource)&&request.subResource=='token'&&request.operation=='CREATE'&&has(request.namespace)&&request.namespace=='kube-system')"
	// The controller-manager's authenticated base client creates its own
	// controller ServiceAccounts before acquiring their scoped TokenRequests.
	// This can race API readiness on a fresh K3s boot. Keep the prerequisite to
	// CREATE of the core resource in kube-system; no tenant authoring is opened.
	kcmAccount := "(request.userInfo.username=='system:kube-controller-manager'&&(!has(request.resource.group)||request.resource.group=='')&&request.resource.resource=='serviceaccounts'&&(!has(request.subResource)||request.subResource=='')&&request.operation=='CREATE'&&has(request.namespace)&&request.namespace=='kube-system')"
	defaultAccount := "(request.userInfo.username=='system:serviceaccount:kube-system:service-account-controller'&&(!has(request.resource.group)||request.resource.group=='')&&request.resource.resource=='serviceaccounts'&&(!has(request.subResource)||request.subResource=='')&&request.operation=='CREATE'&&has(request.namespace)&&request.namespace in " + string(defaultAccountNamespaces) + "&&object!=null&&has(object.metadata)&&has(object.metadata.name)&&object.metadata.name=='default')"
	nodeToken := "(request.resource.resource=='serviceaccounts'&&has(request.subResource)&&request.subResource=='token'&&request.userInfo.username.startsWith('system:node:'))"
	allowed := "request.userInfo.username==" + string(who) + "||" + identity + "||" + mesh + "||" + envoy + "||" + kcmToken + "||" + kcmAccount + "||" + defaultAccount + "||" + istioElection + "||" + controllerNamespace + "||(" + scoped + "&&(" + controller + "||" + nodeToken + "||" + nodePodRetirement(owned("oldObject")) + "||" + rootCA + "||" + istioCA + "||(" + builtin + "&&(" + owner + "||request.resource.resource in ['replicasets','jobs']))))"
	policy := map[string]interface{}{"apiVersion": "admissionregistration.k8s.io/v1", "kind": "ValidatingAdmissionPolicy", "metadata": map[string]interface{}{"name": fence}, "spec": map[string]interface{}{"failurePolicy": "Fail", "matchConstraints": map[string]interface{}{"resourceRules": []interface{}{map[string]interface{}{"apiGroups": []string{"", "apps", "batch", "uds.dev", "rbac.authorization.k8s.io", "gateway.networking.k8s.io"}, "apiVersions": []string{"*"}, "operations": []string{"CREATE", "UPDATE", "DELETE", "CONNECT"}, "resources": []string{"pods", "pods/exec", "pods/attach", "pods/portforward", "services", "secrets", "configmaps", "serviceaccounts", "serviceaccounts/token", "namespaces", "deployments", "statefulsets", "daemonsets", "replicasets", "replicationcontrollers", "jobs", "cronjobs", "packages", "exemptions", "clusterconfigs", "roles", "rolebindings", "clusterroles", "clusterrolebindings", "gateways", "gatewayclasses", "httproutes", "udproutes", "tcproutes", "tlsroutes", "grpcroutes", "referencegrants"}}}}, "validations": []interface{}{map[string]interface{}{"expression": allowed, "message": "Native development bootstrap is incomplete; tenant authoring and access have not been enabled"}}}}
	binding := map[string]interface{}{"apiVersion": "admissionregistration.k8s.io/v1", "kind": "ValidatingAdmissionPolicyBinding", "metadata": map[string]interface{}{"name": fence}, "spec": map[string]interface{}{"policyName": fence, "validationActions": []string{"Deny"}}}
	return []map[string]interface{}{policy, binding}, nil
}
