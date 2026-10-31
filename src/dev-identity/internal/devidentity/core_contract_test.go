// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package devidentity

import (
	"encoding/json"
	"os"
	"reflect"
	"testing"
)

// The oracle corpus was produced from the qualified converter, outside this
// standalone module. Expectations do not call the implementation under test.
func TestIndependentCoreContractCapture(t *testing.T) {
	raw, err := os.ReadFile("testdata/core-contract-corpus.json")
	if err != nil {
		t.Fatal(err)
	}
	var cases []struct {
		Name       string         `json:"name"`
		Spec       Sso            `json:"spec"`
		Digest     string         `json:"specSHA256"`
		Projection map[string]any `json:"projection"`
	}
	if err := json.Unmarshal(raw, &cases); err != nil {
		t.Fatal(err)
	}
	if len(cases) != 54 {
		t.Fatal("complete captured contract corpus required")
	}
	for _, item := range cases {
		t.Run(item.Name, func(t *testing.T) {
			if actual := CoreClientSpecDigest(item.Spec); actual != item.Digest {
				t.Fatalf("authoritative SSO digest changed: %s != %s", actual, item.Digest)
			}
			if actual := CanonicalClientProjection(item.Spec); !reflect.DeepEqual(actual, item.Projection) {
				t.Fatalf("authoritative projection changed: %#v != %#v", actual, item.Projection)
			}
		})
	}
}

func TestStandalonePairingDefaultsFailClosed(t *testing.T) {
	management, _, _, _ := managementFixture(t)
	source := &packageFixture{pkg: audiencePackage()}
	management.Clients.Packages = source
	if management.Clients.CoreAudiencePairsEnabled {
		t.Fatal("pairing enabled without explicit composition")
	}
	client := ownedClient(source.pkg, 1)
	if err := management.authenticateCoreOwner(t.Context(), Principal{Role: "operator", Subject: "uds-operator"}, &client); err == nil {
		t.Fatal("original Pepr registration acquired cross-client authority")
	}
	// A stale stored owner record cannot bypass the disabled grant boundary.
	client.CoreOwner = &CoreClientOwner{Namespace: source.pkg.Namespace, Package: source.pkg.Name, UID: string(source.pkg.UID), SpecSHA256: CoreClientSpecDigest(source.pkg.Spec.Sso[1])}
	if err := management.Clients.validateCoreRecord(t.Context(), client); err == nil {
		t.Fatal("disabled composition retained stored pairing authority")
	}
	ordinary := ClientRecord{Realm: "uds", Data: map[string]any{"clientId": "ordinary", "publicClient": false}}
	if err := management.authenticateCoreOwner(t.Context(), Principal{Role: "operator", Subject: "uds-operator"}, &ordinary); err != nil {
		t.Fatal("ordinary original Pepr client rejected", err)
	}
}
