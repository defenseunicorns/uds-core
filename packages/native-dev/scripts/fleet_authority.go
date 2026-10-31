// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package main

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

type fleetAuthorityConfig struct {
	Namespace           string `json:"namespace"`
	FleetClientEnabled  bool   `json:"fleetClientEnabled"`
	FleetNamespace      string `json:"fleetNamespace"`
	FleetServiceAccount string `json:"fleetServiceAccount"`
}

var namespaceName = regexp.MustCompile(`^[a-z0-9]([-a-z0-9]*[a-z0-9])?$`)

// A disposable Fleet fixture deletes its Namespace, including namespaced RBAC.
// Reinstall that authority as part of fixture deployment before running it again.
func restoreFleetAuthority(identityNamespace string) error {
	kubeconfig := os.Getenv("KUBECONFIG")
	if !filepath.IsAbs(kubeconfig) || strings.Contains(kubeconfig, string(os.PathListSeparator)) {
		return errors.New("Fleet authority restoration requires one explicit absolute KUBECONFIG")
	}
	if _, err := os.Stat(kubeconfig); err != nil {
		return err
	}
	if !validNamespace(identityNamespace) {
		return errors.New("invalid native identity namespace")
	}
	secret, err := get("secret", identityNamespace, "uds-native-identity-config")
	if err != nil {
		return err
	}
	encoded, _ := mapAt(secret, "data")["bridge.json"].(string)
	raw, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return errors.New("invalid installed native identity configuration")
	}
	var cfg fleetAuthorityConfig
	if json.Unmarshal(raw, &cfg) != nil || cfg.Namespace != identityNamespace || !validNamespace(cfg.FleetNamespace) || !validAccount(cfg.FleetServiceAccount) {
		return errors.New("installed native identity has no valid scoped Fleet authority")
	}
	if !cfg.FleetClientEnabled {
		return errors.New("Fleet management is disabled; enable the documented FLEET_CLIENT_ENABLED test fixture first")
	}
	for _, document := range fleetAuthorityDocuments(cfg) {
		if err := apply(document); err != nil {
			return err
		}
	}
	fmt.Printf("Restored scoped Fleet bound-identity RBAC in %s\n", cfg.FleetNamespace)
	return nil
}

func validNamespace(name string) bool { return len(name) <= 63 && namespaceName.MatchString(name) }
func validAccount(name string) bool {
	if len(name) > 253 || name == "" {
		return false
	}
	for _, part := range strings.Split(name, ".") {
		if !validNamespace(part) {
			return false
		}
	}
	return true
}

func fleetAuthorityDocuments(cfg fleetAuthorityConfig) []map[string]interface{} {
	ns := object("Namespace", cfg.FleetNamespace, "")
	mapAt(ns, "metadata")["labels"] = map[string]string{"zarf.dev/agent": "ignore"}
	role := object("Role", "uds-native-fleet-bound-identity", cfg.FleetNamespace)
	role["apiVersion"] = "rbac.authorization.k8s.io/v1"
	role["rules"] = []interface{}{
		map[string]interface{}{"apiGroups": []string{""}, "resources": []string{"serviceaccounts"}, "resourceNames": []string{cfg.FleetServiceAccount}, "verbs": []string{"get"}},
		map[string]interface{}{"apiGroups": []string{""}, "resources": []string{"pods"}, "verbs": []string{"get"}},
	}
	binding := object("RoleBinding", "uds-native-fleet-bound-identity", cfg.FleetNamespace)
	binding["apiVersion"] = "rbac.authorization.k8s.io/v1"
	binding["roleRef"] = map[string]string{"apiGroup": "rbac.authorization.k8s.io", "kind": "Role", "name": "uds-native-fleet-bound-identity"}
	binding["subjects"] = []interface{}{map[string]string{"kind": "ServiceAccount", "name": "uds-native-identity", "namespace": cfg.Namespace}}
	return []map[string]interface{}{ns, role, binding}
}
