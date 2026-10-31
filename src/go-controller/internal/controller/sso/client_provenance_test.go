// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package sso

import (
	"encoding/json"
	uds "github.com/defenseunicorns/uds-core/src/go-controller/api/uds/v1alpha1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/utils/ptr"
	"strings"
	"testing"
)

func TestOrdinaryClientBytesUnaffectedByAudienceProvenance(t *testing.T) {
	pkg := &uds.UDSPackage{ObjectMeta: metav1.ObjectMeta{Namespace: "app", Name: "app", UID: "owned"}, Spec: uds.Spec{Sso: []uds.Sso{{ClientID: "ordinary", Name: "Ordinary", Attributes: map[string]string{"custom": "preserved"}}}}}
	client := convertSsoToClient(pkg.Spec.Sso[0])
	before, _ := json.Marshal(client)
	if err := addCoreAudienceOwner(&client, pkg); err != nil {
		t.Fatal(err)
	}
	after, _ := json.Marshal(client)
	if string(before) != string(after) {
		t.Fatal("ordinary client byte capture changed")
	}
}
func TestOnlyDeclaredPairReceivesExactUIDAndSpecProvenance(t *testing.T) {
	pkg := &uds.UDSPackage{ObjectMeta: metav1.ObjectMeta{Namespace: "app", Name: "app", UID: "owned"}, Spec: uds.Spec{Sso: []uds.Sso{
		{ClientID: "server", Name: "Server"}, {ClientID: "cli", Name: "CLI", PublicClient: ptr.To(true), Attributes: map[string]string{"pkce.code.challenge.method": "S256"}, ProtocolMappers: []uds.ProtocolMapper{{ProtocolMapper: "oidc-audience-mapper", Config: map[string]string{"id.token.claim": "true", "included.client.audience": "server"}}}}, {ClientID: "unrelated", Name: "Unrelated"},
	}}}
	for _, spec := range pkg.Spec.Sso {
		client := convertSsoToClient(spec)
		if err := addCoreAudienceOwner(&client, pkg); err != nil {
			t.Fatal(err)
		}
		count := 0
		for key := range client.Attributes {
			if strings.HasPrefix(key, CoreOwnerPrefix) {
				count++
			}
		}
		if spec.ClientID == "unrelated" {
			if count != 0 {
				t.Fatal("unrelated received provenance")
			}
			continue
		}
		if count != 4 || client.Attributes[CoreOwnerPrefix+"uid"] != "owned" || client.Attributes[CoreOwnerPrefix+"spec-sha256"] != CoreClientSpecDigest(spec) {
			t.Fatal("pair did not bind exact live spec/UID")
		}
	}
	pkg.Spec.Sso[1].Attributes[CoreOwnerPrefix+"uid"] = "user-supplied"
	client := convertSsoToClient(pkg.Spec.Sso[0])
	if err := addCoreAudienceOwner(&client, pkg); err == nil {
		t.Fatal("reserved attrs silently trusted or overwritten")
	}
}

func TestRemovingDeclaredPublicPairSendsActualEmptyMapperList(t *testing.T) {
	existing := Client{ClientID: "cli", PublicClient: ptr.To(true), Attributes: map[string]string{CoreOwnerPrefix + "uid": "real"}, ProtocolMappers: []ProtocolMapper{{ProtocolMapper: "oidc-audience-mapper"}}}
	desired := Client{ClientID: "cli", PublicClient: ptr.To(true), Attributes: map[string]string{"pkce.code.challenge.method": "S256"}}
	clearRemovedCoreAudience(existing, &desired)
	raw, err := json.Marshal(desired)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(raw), `"protocolMappers":[]`) {
		t.Fatal("removed pair did not clear actual provider mapper")
	}
	if clientMatchesDesired(existing, desired) {
		t.Fatal("stale mapper treated as unchanged")
	}
	ordinary := Client{ClientID: "ordinary"}
	before, _ := json.Marshal(ordinary)
	clearRemovedCoreAudience(Client{ClientID: "ordinary"}, &ordinary)
	after, _ := json.Marshal(ordinary)
	if string(before) != string(after) {
		t.Fatal("ordinary transition bytes changed")
	}
}
