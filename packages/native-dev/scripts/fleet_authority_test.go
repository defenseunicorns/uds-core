// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package main

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func TestFleetNamespaceRecreationRestoresOnlyScopedAuthority(t *testing.T) {
	config := fleetAuthorityConfig{Namespace: "keycloak", FleetClientEnabled: true, FleetNamespace: "uds-fleet-command", FleetServiceAccount: "uds-fleet-command-sa"}
	raw, _ := json.Marshal(config)
	previous := kube
	t.Cleanup(func() { kube = previous })
	configuration := map[string]interface{}{"data": map[string]interface{}{"bridge.json": base64.StdEncoding.EncodeToString(raw)}}
	state := map[string]map[string]interface{}{}
	kube = func(input interface{}, args ...string) ([]byte, error) {
		if reflect.DeepEqual(args, []string{"get", "secret", "uds-native-identity-config", "--ignore-not-found", "-o", "json", "-n", "keycloak"}) {
			return json.Marshal(configuration)
		}
		if !reflect.DeepEqual(args, []string{"apply", "-f", "-"}) {
			return nil, fmt.Errorf("unexpected authority operation %v", args)
		}
		obj := input.(map[string]interface{})
		state[obj["kind"].(string)] = obj
		return nil, nil
	}
	kubeconfig := filepath.Join(t.TempDir(), "kubeconfig")
	if err := os.WriteFile(kubeconfig, []byte("owned test config"), 0600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("KUBECONFIG", kubeconfig)
	for run := 0; run < 2; run++ {
		// The source fixture's afterAll deletes Namespace, Role and RoleBinding.
		clear(state)
		if err := restoreFleetAuthority("keycloak"); err != nil {
			t.Fatal(err)
		}
		if len(state) != 3 || state["ClusterRole"] != nil || state["ClusterRoleBinding"] != nil {
			t.Fatal("authority restoration changed cluster-wide privileges", state)
		}
		if mapAt(state["Namespace"], "metadata")["name"] != "uds-fleet-command" || mapAt(state["Role"], "metadata")["namespace"] != "uds-fleet-command" || mapAt(state["RoleBinding"], "metadata")["namespace"] != "uds-fleet-command" {
			t.Fatal("authority escaped the configured Fleet namespace")
		}
		rules := state["Role"]["rules"].([]interface{})
		account := rules[0].(map[string]interface{})
		pods := rules[1].(map[string]interface{})
		if len(rules) != 2 || !reflect.DeepEqual(account["resources"], []string{"serviceaccounts"}) || !reflect.DeepEqual(account["resourceNames"], []string{"uds-fleet-command-sa"}) || !reflect.DeepEqual(account["verbs"], []string{"get"}) || !reflect.DeepEqual(pods["resources"], []string{"pods"}) || !reflect.DeepEqual(pods["verbs"], []string{"get"}) {
			t.Fatal("restored authority broadened the bound identity reads", rules)
		}
		if !reflect.DeepEqual(state["RoleBinding"]["subjects"], []interface{}{map[string]string{"kind": "ServiceAccount", "name": "uds-native-identity", "namespace": "keycloak"}}) || !reflect.DeepEqual(state["RoleBinding"]["roleRef"], map[string]string{"apiGroup": "rbac.authorization.k8s.io", "kind": "Role", "name": "uds-native-fleet-bound-identity"}) {
			t.Fatal("restored authority bound another principal or role")
		}
	}
	configuration["data"] = map[string]interface{}{"bridge.json": base64.StdEncoding.EncodeToString([]byte(`{"namespace":"keycloak","fleetClientEnabled":false,"fleetNamespace":"uds-fleet-command","fleetServiceAccount":"uds-fleet-command-sa"}`))}
	clear(state)
	if err := restoreFleetAuthority("keycloak"); err == nil || len(state) != 0 {
		t.Fatal("disabled Fleet fixture authored authority grants")
	}
	configuration["data"] = map[string]interface{}{"bridge.json": base64.StdEncoding.EncodeToString([]byte(`{"namespace":"other","fleetNamespace":"uds-fleet-command","fleetServiceAccount":"uds-fleet-command-sa"}`))}
	clear(state)
	if err := restoreFleetAuthority("keycloak"); err == nil || len(state) != 0 {
		t.Fatal("mismatched configuration authored an authority grant")
	}
}

func TestFleetAuthorityRejectsImplicitOrMultipleKubeconfigs(t *testing.T) {
	for _, value := range []string{"", "relative", "/one" + string(os.PathListSeparator) + "/two"} {
		t.Setenv("KUBECONFIG", value)
		if err := restoreFleetAuthority("keycloak"); err == nil {
			t.Fatal("unsafe kubeconfig accepted", value)
		}
	}
}
