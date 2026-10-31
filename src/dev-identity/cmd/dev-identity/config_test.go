// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestRuntimeRequiresExplicitProfileAndRejectsUnenforcedAuthRequirements(t *testing.T) {
	base := map[string]any{"namespace": "identity", "publicHost": "sso.example.test", "issuerPath": "/realms/uds", "dexAPIs": []map[string]string{{"address": "localhost:5557"}}, "passwordOnly": true}
	for _, change := range []struct {
		name  string
		apply func(map[string]any)
		valid bool
	}{
		{"explicit password-only", func(map[string]any) {}, true},
		{"implicit profile", func(cfg map[string]any) { delete(cfg, "passwordOnly") }, false},
		{"required MFA", func(cfg map[string]any) { cfg["requireMFA"] = true }, false},
		{"unsupported required user action", func(cfg map[string]any) {
			cfg["users"] = []map[string]any{{"id": "user", "username": "user", "requiredActions": []string{"CONFIGURE_TOTP"}}}
		}, false},
	} {
		t.Run(change.name, func(t *testing.T) {
			cfg := map[string]any{}
			for key, value := range base {
				cfg[key] = value
			}
			change.apply(cfg)
			raw, _ := json.Marshal(cfg)
			file := filepath.Join(t.TempDir(), "config.json")
			if err := os.WriteFile(file, raw, 0600); err != nil {
				t.Fatal(err)
			}
			_, err := readConfiguration(file)
			if (err == nil) != change.valid {
				t.Fatalf("runtime requirement accepted=%v, expected=%v, error=%v", err == nil, change.valid, err)
			}
		})
	}
}

func TestFleetRuntimeConfigurationIsExplicitOptIn(t *testing.T) {
	base := map[string]any{"namespace": "identity", "publicHost": "sso.example.test", "issuerPath": "/realms/uds", "dexAPIs": []map[string]string{{"address": "localhost:5557"}}, "passwordOnly": true}
	for _, value := range []any{nil, false, true} {
		if value == nil {
			delete(base, "fleetClientEnabled")
		} else {
			base["fleetClientEnabled"] = value
		}
		raw, _ := json.Marshal(base)
		path := filepath.Join(t.TempDir(), "config.json")
		if err := os.WriteFile(path, raw, 0600); err != nil {
			t.Fatal(err)
		}
		cfg, err := readConfiguration(path)
		if err != nil || cfg.FleetClientEnabled != (value == true) {
			t.Fatal("Fleet enabled without explicit true", value, err)
		}
	}
}
