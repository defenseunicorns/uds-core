// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package resources

import (
	"encoding/json"
	"os"
	"testing"
)

func TestPinnedPackageValidatorParity(t *testing.T) {
	raw, err := os.ReadFile("testdata/package-parity.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixture struct {
		SourceRevision string `json:"sourceRevision"`
		Cases          []struct {
			Name     string          `json:"name"`
			Old      json.RawMessage `json:"old"`
			Object   json.RawMessage `json:"object"`
			Existing json.RawMessage `json:"existing"`
			Config   struct {
				Domain             string `json:"domain"`
				AdminDomain        string `json:"adminDomain"`
				AllowPublicClients bool   `json:"allowPublicClients"`
			} `json:"config"`
			Allowed *bool  `json:"allowed"`
			Message string `json:"message"`
		} `json:"cases"`
	}
	if err := json.Unmarshal(raw, &fixture); err != nil {
		t.Fatal(err)
	}
	if fixture.SourceRevision != "129d6e4a1928ce2b10ba6c5c8b5a0e7350f4053c" || len(fixture.Cases) != 140 {
		t.Fatalf("incomplete or unpinned reference: %s, %d cases", fixture.SourceRevision, len(fixture.Cases))
	}
	for _, test := range fixture.Cases {
		t.Run(test.Name, func(t *testing.T) {
			if test.Allowed == nil {
				t.Fatal("reference did not produce an admission decision")
			}
			object, err := Decode(test.Object)
			if err != nil {
				t.Fatal(err)
			}
			existing, err := decodeExisting(test.Existing)
			if err != nil {
				t.Fatal(err)
			}
			old, _ := Decode(test.Old)
			message := ValidatePackage(object, old, existing, Config{Domain: test.Config.Domain, AdminDomain: test.Config.AdminDomain, AllowPublicClients: test.Config.AllowPublicClients})
			if (message == "") != *test.Allowed || message != test.Message {
				t.Errorf("decision mismatch: Go %q; reference allowed=%t, %q", message, *test.Allowed, test.Message)
			}
		})
	}
}
