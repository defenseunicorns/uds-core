// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package main

import (
	"encoding/json"
	"fmt"
	"net/http"
)

func (c cluster) preflight() error {
	raw, err := c.request(http.MethodGet, "/apis/admissionregistration.k8s.io/v1", nil, false)
	if err != nil {
		return err
	}
	var discovery struct {
		Resources []struct{ Name string `json:"name"` } `json:"resources"`
	}
	if err = json.Unmarshal(raw, &discovery); err != nil {
		return err
	}
	required := map[string]bool{"mutatingadmissionpolicies": false, "mutatingadmissionpolicybindings": false, "validatingadmissionpolicies": false, "validatingadmissionpolicybindings": false}
	for _, r := range discovery.Resources {
		if _, ok := required[r.Name]; ok {
			required[r.Name] = true
		}
	}
	for name, found := range required {
		if !found {
			return fmt.Errorf("Core requires native admission v1 APIs (Kubernetes 1.36 or newer); missing %s; the existing operator has not been stopped", name)
		}
	}
	return nil
}
