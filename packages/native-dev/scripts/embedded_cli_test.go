// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package main

import (
	"encoding/json"
	"os"
	"testing"
)

func TestRealEmbeddedUDSZarfKubectlRuntime(t *testing.T) {
	if os.Getenv("UDS_NATIVE_BOOTSTRAP_CLI") == "" {
		t.Fatal("integration check requires the real trusted absolute UDS executable in UDS_NATIVE_BOOTSTRAP_CLI")
	}
	t.Setenv("UDS_NATIVE_BOOTSTRAP_CLI_MODE", "uds")
	data, err := kubectl(nil, "version", "--client", "-o", "json")
	if err != nil {
		t.Fatal(err)
	}
	var result map[string]interface{}
	if err := json.Unmarshal(data, &result); err != nil {
		t.Fatal(err)
	}
	if mapAt(result, "clientVersion")["gitVersion"] == nil {
		t.Fatal("real embedded kubectl did not return its client version")
	}
}

func TestBootstrapCLIRejectsRelativeAndUnsupportedModes(t *testing.T) {
	previous := os.Getenv("UDS_NATIVE_BOOTSTRAP_CLI")
	t.Setenv("UDS_NATIVE_BOOTSTRAP_CLI", "./zarf")
	if _, _, err := bootstrapCLI(); err == nil {
		t.Fatal("ambient relative executable accepted")
	}
	t.Setenv("UDS_NATIVE_BOOTSTRAP_CLI", previous)
	t.Setenv("UDS_NATIVE_BOOTSTRAP_CLI_MODE", "shell")
	if _, _, err := bootstrapCLI(); err == nil {
		t.Fatal("unreviewed command mode accepted")
	}
}
