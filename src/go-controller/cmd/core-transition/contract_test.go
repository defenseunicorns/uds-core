// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package main

import (
	"encoding/json"
	native "github.com/defenseunicorns/uds-core/src/go-controller/native-admission"
	"os"
	"testing"
)

func TestInstallerCountMatchesShippedContract(t *testing.T) {
	raw, err := os.ReadFile("../../native-admission/admission-contract.json")
	if err != nil {
		t.Fatal(err)
	}
	var contract struct{ Items []object }
	if err = json.Unmarshal(raw, &contract); err != nil {
		t.Fatal(err)
	}
	definitions, err := native.Contract()
	if err != nil {
		t.Fatal(err)
	}
	if len(contract.Items) != expectedAdmissionObjects || len(definitions)+5 != expectedAdmissionObjects {
		t.Fatal("installer count drifted from native policies plus five webhook registrations")
	}
	for _, definition := range definitions {
		found := false
		for _, item := range contract.Items {
			if str(item, "kind") == definition.Kind && str(item, "metadata", "name") == definition.Metadata.Name {
				found = true
			}
		}
		if !found {
			t.Fatal("missing installer policy", definition.Metadata.Name)
		}
	}
}
