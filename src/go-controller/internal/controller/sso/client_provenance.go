// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package sso

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"

	uds "github.com/defenseunicorns/uds-core/src/go-controller/api/uds/v1alpha1"
	"k8s.io/utils/ptr"
)

const CoreOwnerPrefix = "uds.dev/native-package-"

// CanonicalClientProjection is the same supported representation the operator
// sends to its identity provider, shared with authoritative native validation.
func CanonicalClientProjection(spec uds.Sso) map[string]any {
	raw, _ := json.Marshal(convertSsoToClient(spec))
	var data map[string]any
	_ = json.Unmarshal(raw, &data)
	return data
}

func CoreClientSpecDigest(spec uds.Sso) string {
	raw, _ := json.Marshal(spec)
	hash := sha256.Sum256(raw)
	return hex.EncodeToString(hash[:])
}

// Inject provenance only for a declared public-PKCE ID-token audience pair.
// Ordinary and legacy clients retain their original serialized representation.
func addCoreAudienceOwner(client *Client, pkg *uds.UDSPackage) error {
	for _, spec := range pkg.Spec.Sso {
		for key := range spec.Attributes {
			if strings.HasPrefix(key, CoreOwnerPrefix) {
				return fmt.Errorf("reserved native identity provenance cannot be declared by Package")
			}
		}
	}
	for _, source := range pkg.Spec.Sso {
		if !ptr.Deref(source.PublicClient, false) || source.Attributes["pkce.code.challenge.method"] != "S256" {
			continue
		}
		for _, mapper := range source.ProtocolMappers {
			target := mapper.Config["included.client.audience"]
			if mapper.ProtocolMapper != "oidc-audience-mapper" || mapper.Config["id.token.claim"] != "true" || target == "" {
				continue
			}
			if client.ClientID != source.ClientID && client.ClientID != target {
				continue
			}
			for _, spec := range pkg.Spec.Sso {
				if spec.ClientID != client.ClientID {
					continue
				}
				if client.Attributes == nil {
					client.Attributes = map[string]string{}
				}
				client.Attributes[CoreOwnerPrefix+"namespace"] = pkg.Namespace
				client.Attributes[CoreOwnerPrefix+"name"] = pkg.Name
				client.Attributes[CoreOwnerPrefix+"uid"] = string(pkg.UID)
				client.Attributes[CoreOwnerPrefix+"spec-sha256"] = CoreClientSpecDigest(spec)
				return nil
			}
		}
	}
	return nil
}

// Clearing a previously declared native public pair must revoke its mapper.
// The ordinary converter continues to omit provider-owned defaults.
func clearRemovedCoreAudience(existing Client, desired *Client) {
	if ptr.Deref(existing.PublicClient, false) && existing.Attributes[CoreOwnerPrefix+"uid"] != "" && desired.Attributes[CoreOwnerPrefix+"uid"] == "" {
		desired.ProtocolMappers = []ProtocolMapper{}
	}
}
