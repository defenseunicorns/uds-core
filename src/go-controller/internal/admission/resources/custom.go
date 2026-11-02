// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package resources

import (
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"fmt"
	"regexp"
	"strings"

	"github.com/defenseunicorns/uds-core/src/go-controller/internal/admission/exemptions"
)

var certificateBlocks = regexp.MustCompile(`(?s)-----BEGIN CERTIFICATE-----.*?-----END CERTIFICATE-----`)

func ValidateClusterConfig(object Object) string {
	certs := object.Object("spec").Object("caBundle").String("certs")
	if certs == "" || certs == "###ZARF_VAR_CA_BUNDLE_CERTS###" {
		return ""
	}
	decoded, err := base64.StdEncoding.DecodeString(certs)
	if err != nil || base64.StdEncoding.EncodeToString(decoded) != certs {
		return "Validation failed: ClusterConfig: caBundle.certs must be base64 encoded; found invalid value"
	}
	blocks := certificateBlocks.FindAll(decoded, -1)
	if len(blocks) == 0 {
		return "Validation failed: ClusterConfig: No valid certificates found in bundle"
	}
	for index, raw := range blocks {
		block, _ := pem.Decode(raw)
		if block == nil {
			return fmt.Sprintf("Validation failed: ClusterConfig: Invalid certificate at index %d: malformed PEM certificate", index)
		}
		if _, err := x509.ParseCertificate(block.Bytes); err != nil {
			return fmt.Sprintf("Validation failed: ClusterConfig: Invalid certificate at index %d: %s", index, err)
		}
	}
	return ""
}

func ValidateExemption(object Object, allowAll bool) string {
	metadata := object.Object("metadata")
	if !allowAll && metadata.String("namespace") != exemptions.ProtectedNamespace {
		return fmt.Sprintf("Invalid namespace %q for UDSExemption %s: must be %q", metadata.String("namespace"), metadata.String("name"), exemptions.ProtectedNamespace)
	}
	entries := object.Object("spec").List("exemptions")
	for _, entry := range entries {
		matcher := entry.Object("matcher")
		kind := matcher.String("kind")
		for _, policy := range entry.Strings("policies") {
			service := policy == "RestrictExternalNames" || policy == "DisallowNodePortServices"
			known := false
			for _, valid := range exemptions.Policies {
				known = known || valid == policy
			}
			if !known || kind != "pod" && kind != "service" || service != (kind == "service") {
				validKind := "pod"
				if kind == "pod" {
					validKind = "service"
				}
				return fmt.Sprintf("Invalid kind %q for matcher %q with policy %q: %q can only be exempted for kind %q", kind, matcher.String("name"), policy, policy, validKind)
			}
		}
	}
	for index, entry := range entries {
		pattern := entry.Object("matcher").String("name")
		if strings.HasPrefix(pattern, "/") && strings.HasSuffix(pattern, "/") {
			return fmt.Sprintf("Invalid matcher name %q: please remove the leading and trailing slashes", pattern)
		}
		if err := exemptions.ValidatePattern(pattern); err != nil {
			return fmt.Sprintf("Exemption %s/%s matcher[%d] pattern %q is not a valid RE2 expression: %s; syntax: %s", metadata.String("namespace"), metadata.String("name"), index, pattern, err, exemptions.RE2Syntax)
		}
	}
	return ""
}
