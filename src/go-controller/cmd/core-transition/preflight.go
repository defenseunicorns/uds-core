// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package main

import (
	"encoding/json"
	"fmt"
	"k8s.io/apimachinery/pkg/util/version"
	"net/http"
)

func (c cluster) preflight() error {
	rawVersion, err := c.request(http.MethodGet, "/version", nil, false)
	if err != nil {
		return err
	}
	var info struct {
		GitVersion string `json:"gitVersion"`
	}
	if err := json.Unmarshal(rawVersion, &info); err != nil {
		return err
	}
	current, err := version.ParseSemantic(info.GitVersion)
	if err != nil || current.LessThan(version.MustParseSemantic("1.36.0-0")) {
		return fmt.Errorf("Core requires Kubernetes 1.36 or newer; server reports %q; the existing operator has not been stopped", info.GitVersion)
	}

	raw, err := c.request(http.MethodGet, "/apis/admissionregistration.k8s.io/v1", nil, false)
	if err != nil {
		return err
	}
	var discovery struct {
		Resources []struct {
			Name string `json:"name"`
		} `json:"resources"`
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
