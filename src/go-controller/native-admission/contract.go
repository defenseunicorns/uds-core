// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package nativeadmission

import (
	_ "embed"
	"encoding/json"
)

// Embed the renderer's canonical policy contract, not a second handwritten copy.
// Callers receive fresh values and cannot change the compiled authority contract.
//
//go:embed policies.json
var encodedContract string

type Definition struct {
	APIVersion string `json:"apiVersion"`
	Kind       string `json:"kind"`
	Metadata   struct {
		Name string `json:"name"`
	} `json:"metadata"`
	Spec map[string]interface{} `json:"spec"`
}

func Contract() ([]Definition, error) {
	var contract struct {
		Items []Definition `json:"items"`
	}
	err := json.Unmarshal([]byte(encodedContract), &contract)
	return contract.Items, err
}
