// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package nativeadmission

import (
	"bytes"
	"os"
	"testing"
)

func TestEmbeddedRuntimeContractIsTheDeployedChartContract(t *testing.T) {
	chart, err := os.ReadFile("../chart/files/native-admission/policies.json")
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(chart, []byte(encodedContract)) {
		t.Fatal("runtime policy authority differs from the deployed chart artifact")
	}
	first, err := Contract()
	if err != nil || len(first) != 22 {
		t.Fatal("incomplete native policy and binding contract", len(first), err)
	}
	first[0].Spec["failurePolicy"] = "Ignore"
	second, err := Contract()
	if err != nil || second[0].Spec["failurePolicy"] != "Fail" {
		t.Fatal("caller mutated the compiled policy authority", err)
	}
}
