// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"strings"

	"k8s.io/apimachinery/pkg/util/yaml"
)

// This file is generated from the actual chart, not a second hand-maintained
// admission specification. Serving CAs are verified against the live Secret.
func (c cluster) generateContract(chart, path string) error {
	rendered, err := c.command(nil, "helm", "template", "uds-controller", chart, "--namespace", "uds-system", "--kube-version", "1.36.1")
	if err != nil {
		return err
	}
	decoder := yaml.NewYAMLOrJSONDecoder(bytes.NewReader(rendered), 4096)
	var items []object
	for {
		var o object
		err = decoder.Decode(&o)
		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}
		kind := str(o, "kind")
		if strings.HasSuffix(kind, "AdmissionPolicy") || strings.HasSuffix(kind, "AdmissionPolicyBinding") || strings.HasSuffix(kind, "WebhookConfiguration") {
			items = append(items, o)
		}
	}
	if len(items) != 27 {
		return fmt.Errorf("incomplete rendered admission contract: %d", len(items))
	}
	raw, err := json.MarshalIndent(object{"items": items}, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, append(raw, '\n'), 0600)
}
func stripServingCA(o object) {
	hooks, _ := o["webhooks"].([]any)
	for _, raw := range hooks {
		h, _ := raw.(map[string]any)
		config, _ := h["clientConfig"].(map[string]any)
		delete(config, "caBundle")
	}
}
func (c cluster) servingCAConverged(o object) (bool, error) {
	secret, err := c.get("secret", "uds-system", "uds-controller-serving-certificate")
	if err != nil {
		return false, err
	}
	ca := str(secret, "data", "ca.crt")
	if ca == "" {
		return false, nil
	}
	hooks, _ := o["webhooks"].([]any)
	if len(hooks) == 0 {
		return false, nil
	}
	for _, raw := range hooks {
		h, _ := raw.(map[string]any)
		config, _ := h["clientConfig"].(map[string]any)
		if config["caBundle"] != ca {
			return false, nil
		}
	}
	return true, nil
}
