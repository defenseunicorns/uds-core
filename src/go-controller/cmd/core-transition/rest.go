// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"

	_ "k8s.io/client-go/plugin/pkg/client/auth"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
)

type resource struct {
	prefix, name string
	namespaced   bool
}

func apiResource(kind string) (resource, error) {
	kind = strings.ToLower(kind)
	known := map[string]resource{}
	add := func(names []string, prefix, name string, ns bool) {
		for _, n := range names {
			known[n] = resource{prefix, name, ns}
		}
	}
	add([]string{"namespace", "namespaces"}, "/api/v1", "namespaces", false)
	add([]string{"deployment", "deployments"}, "/apis/apps/v1", "deployments", true)
	add([]string{"replicaset", "replicasets"}, "/apis/apps/v1", "replicasets", true)
	for _, entry := range []struct{ singular, plural string }{{"pod", "pods"}, {"service", "services"}, {"secret", "secrets"}, {"configmap", "configmaps"}, {"serviceaccount", "serviceaccounts"}} {
		add([]string{entry.singular, entry.plural}, "/api/v1", entry.plural, true)
	}
	add([]string{"customresourcedefinition", "customresourcedefinitions"}, "/apis/apiextensions.k8s.io/v1", "customresourcedefinitions", false)
	add([]string{"clusterconfig.uds.dev"}, "/apis/uds.dev/v1alpha1", "clusterconfig", false)
	add([]string{"packages.uds.dev"}, "/apis/uds.dev/v1alpha1", "packages", true)
	add([]string{"admissionparameters.policy.uds.dev"}, "/apis/policy.uds.dev/v1alpha1", "admissionparameters", true)
	for _, r := range []string{"validatingadmissionpolicies", "mutatingadmissionpolicies", "validatingadmissionpolicybindings", "mutatingadmissionpolicybindings", "mutatingwebhookconfigurations", "validatingwebhookconfigurations"} {
		add([]string{r}, "/apis/admissionregistration.k8s.io/v1", r, false)
	}
	for _, entry := range []struct {
		name string
		ns   bool
	}{{"roles", true}, {"rolebindings", true}, {"clusterroles", false}, {"clusterrolebindings", false}} {
		add([]string{entry.name}, "/apis/rbac.authorization.k8s.io/v1", entry.name, entry.ns)
	}
	for _, r := range []string{"servicemonitors", "prometheusrules"} {
		add([]string{r}, "/apis/monitoring.coreos.com/v1", r, true)
	}
	add([]string{"horizontalpodautoscalers"}, "/apis/autoscaling/v2", "horizontalpodautoscalers", true)
	add([]string{"peprstores"}, "/apis/pepr.dev/v1", "peprstores", true)
	found, ok := known[kind]
	if !ok {
		return resource{}, fmt.Errorf("unsupported Core transition resource %s", kind)
	}
	return found, nil
}
func (c *cluster) initializeREST(path string) error {
	// Match Zarf's loader: KUBECONFIG (including merged files), then the
	// user's default config, with client-go's in-cluster fallback.
	loader := clientcmd.NewDefaultClientConfigLoadingRules()
	loader.ExplicitPath = path
	cfg, err := clientcmd.NewNonInteractiveDeferredLoadingClientConfig(loader, nil).ClientConfig()
	if err != nil {
		return err
	}
	client, err := rest.HTTPClientFor(cfg)
	if err != nil {
		return err
	}
	c.http = client
	c.server = cfg.Host
	c.restConfig = rest.CopyConfig(cfg)
	return nil
}
func (c cluster) request(method, path string, input []byte, ignoreMissing bool) ([]byte, error) {
	request, err := http.NewRequestWithContext(c.ctx, method, strings.TrimRight(c.server, "/")+path, bytes.NewReader(input))
	if err != nil {
		return nil, err
	}
	if method == http.MethodPatch {
		request.Header.Set("Content-Type", "application/json-patch+json")
	} else {
		request.Header.Set("Content-Type", "application/json")
	}
	response, err := c.http.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(response.Body, 32<<20))
	if err != nil {
		return nil, err
	}
	if response.StatusCode == 404 && ignoreMissing {
		return nil, nil
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		var status struct {
			Message string `json:"message"`
		}
		_ = json.Unmarshal(raw, &status)
		return nil, fmt.Errorf("Core transition API %s %s: %d %s", method, path, response.StatusCode, status.Message)
	}
	return raw, nil
}
func (c cluster) restCommand(input []byte, args ...string) ([]byte, error) {
	if len(args) == 0 {
		return nil, fmt.Errorf("missing transition API operation")
	}
	if args[0] == "delete" {
		if len(args) < 3 || args[1] != "--raw" {
			return nil, fmt.Errorf("unsafe delete")
		}
		return c.request(http.MethodDelete, args[2], input, false)
	}
	if args[0] == "create" {
		var obj object
		if err := json.Unmarshal(input, &obj); err != nil {
			return nil, err
		}
		if str(obj, "kind") != "Pod" || !strings.HasPrefix(c.canaryNamespace, "uds-core-admission-probe-") || str(obj, "metadata", "namespace") != c.canaryNamespace {
			return nil, fmt.Errorf("unsupported dry-run canary")
		}
		return c.request(http.MethodPost, "/api/v1/namespaces/"+url.PathEscape(c.canaryNamespace)+"/pods?dryRun=All", input, false)
	}
	if len(args) < 2 {
		return nil, fmt.Errorf("missing transition API resource")
	}
	r, err := apiResource(args[1])
	if err != nil {
		return nil, err
	}
	namespace, name, patch := "", "", []byte(nil)
	if len(args) > 2 && !strings.HasPrefix(args[2], "-") {
		name = args[2]
	}
	for i := 2; i < len(args); i++ {
		if (args[i] == "-n" || args[i] == "--namespace") && i+1 < len(args) {
			namespace = args[i+1]
		}
		if args[i] == "-p" && i+1 < len(args) {
			patch = []byte(args[i+1])
		}
	}
	path := r.prefix
	if r.namespaced {
		if namespace == "" {
			return nil, fmt.Errorf("missing transition namespace")
		}
		path += "/namespaces/" + url.PathEscape(namespace)
	}
	path += "/" + r.name
	if name != "" {
		path += "/" + url.PathEscape(name)
	}
	switch args[0] {
	case "get":
		return c.request(http.MethodGet, path, nil, true)
	case "patch":
		return c.request(http.MethodPatch, path, patch, false)
	default:
		return nil, fmt.Errorf("unsupported transition operation")
	}
}
