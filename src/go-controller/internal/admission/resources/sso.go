// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package resources

import (
	"fmt"
	"net/url"
	"strings"

	"github.com/defenseunicorns/uds-core/src/go-controller/internal/utils"
)

var allowedAttributes = map[string]bool{
	"access.token.lifespan": true, "backchannel.logout.revoke.offline.tokens": true,
	"backchannel.logout.session.required": true, "client.session.idle.timeout": true,
	"client.session.max.lifespan": true, "logout.confirmation.enabled": true,
	"oauth2.device.authorization.grant.enabled": true, "oidc.ciba.grant.enabled": true,
	"pkce.code.challenge.method": true, "post.logout.redirect.uris": true,
	"saml.assertion.signature": true, "saml.client.signature": true, "saml.encrypt": true,
	"saml.signing.certificate": true, "saml_assertion_consumer_url_post": true,
	"saml_assertion_consumer_url_redirect": true, "saml_idp_initiated_sso_url_name": true,
	"saml_name_id_format": true, "saml_single_logout_service_url_post": true,
	"saml_single_logout_service_url_redirect": true, "use.refresh.tokens": true,
}

func migrateSSO(client Object) Object {
	secret := client.Object("secretConfig")
	for old, field := range map[string]string{"secretName": "name", "secretTemplate": "template", "secretLabels": "labels", "secretAnnotations": "annotations"} {
		if client.Truthy(old) {
			if secret == nil {
				secret = Object{}
			}
			if !secret.Truthy(field) {
				secret[field] = client[old]
			}
		}
	}
	if secret != nil {
		encoded, _ := marshalObject(secret)
		client["secretConfig"] = encoded
	}
	return client
}

func validateSSO(namespace string, spec Object, existing []Object, allowPublic, deleting bool) string {
	clients := spec.List("sso")
	ids := map[string]bool{}
	for _, original := range clients {
		client := migrateSSO(original)
		id, secret := client.String("clientId"), client.Object("secretConfig")
		prefix := fmt.Sprintf("The client ID %q ", id)
		if ids[id] {
			return prefix + "is not unique within this package"
		}
		ids[id] = true
		if !deleting && ssoOwnedElsewhere(id, namespace, existing) {
			return prefix + "is already in use by another package."
		}
		if secret.Truthy("name") && utils.SanitizeResourceName(secret.String("name")) != secret.String("name") {
			return prefix + "uses an invalid secret name " + secret.String("name")
		}
		standard := !client.Has("standardFlowEnabled") || client.Bool("standardFlowEnabled")
		if standard && len(client.Strings("redirectUris")) == 0 {
			return prefix + "must specify redirectUris if standardFlowEnabled is turned on (it is enabled by default)"
		}
		if client.Bool("publicClient") {
			if message := validatePublic(client, allowPublic); message != "" {
				return prefix + message
			}
		}
		if !client.Bool("publicClient") && client.Bool("serviceAccountsEnabled") && client.Bool("standardFlowEnabled") {
			return prefix + "serviceAccountsEnabled is disallowed with standardFlowEnabled"
		}
		for _, attr := range objectKeys(client["attributes"]) {
			if !allowedAttributes[attr] {
				return prefix + "contains an unsupported attribute " + fmt.Sprintf("%q", attr)
			}
		}
		if client.Truthy("enableAuthserviceSelector") {
			if strings.Contains(id, ":") {
				return prefix + "is invalid as an Authservice client - Authservice does not support client IDs with the \":\" character"
			}
			for _, uri := range client.Strings("redirectUris") {
				parsed, err := url.Parse(uri)
				if err != nil || parsed.Scheme == "" || (parsed.Scheme == "http" || parsed.Scheme == "https") && parsed.Host == "" {
					return prefix + fmt.Sprintf("has an invalid redirect URI %q. Redirect URIs must be valid URLs.", uri)
				}
				if parsed.Path == "/" || parsed.Path == "" && parsed.Host != "" {
					return prefix + "has redirectUris containing root paths (\"/\"). Authservice clients cannot have root path redirect URIs."
				}
			}
		}
	}
	if !deleting {
		for _, id := range probeClientIDs(spec) {
			if ids[id] {
				return fmt.Sprintf("The client ID %q is reserved for the probe client of %q.", id, strings.TrimSuffix(id, "-probe"))
			}
			if ssoOwnedElsewhere(id, namespace, existing) {
				return fmt.Sprintf("The client ID %q is already in use by another package.", id)
			}
		}
	}
	return ""
}

func probeClientIDs(spec Object) []string {
	hasChecks := false
	for _, expose := range spec.Object("network").List("expose") {
		hasChecks = hasChecks || len(expose.Object("uptime").Object("checks").Strings("paths")) > 0
	}
	if !hasChecks {
		return nil
	}
	var ids []string
	for _, client := range spec.List("sso") {
		if client.Truthy("enableAuthserviceSelector") {
			ids = append(ids, client.String("clientId")+"-probe")
		}
	}
	return ids
}

func ssoOwnedElsewhere(id, namespace string, packages []Object) bool {
	for _, pkg := range packages {
		if pkg.Object("metadata").String("namespace") == namespace {
			continue
		}
		for _, reserved := range probeClientIDs(pkg.Object("spec")) {
			if reserved == id {
				return true
			}
		}
		for _, client := range pkg.Object("spec").List("sso") {
			if client.String("clientId") == id {
				return true
			}
		}
	}
	return false
}

func validatePublic(client Object, allowPublic bool) string {
	attributes, secret := client.Object("attributes"), client.Object("secretConfig")
	deviceOnly := client.Has("standardFlowEnabled") && !client.Bool("standardFlowEnabled") && attributes.String("oauth2.device.authorization.grant.enabled") == "true"
	hasSecret := client.Has("secret") || secret.Has("name") || secret.Has("template")
	if deviceOnly {
		if client.Bool("serviceAccountsEnabled") || hasSecret || client.Has("enableAuthserviceSelector") || client.String("protocol") == "saml" {
			return "sets options incompatible with publicClient"
		}
		return ""
	}
	if !allowPublic {
		return "is a public client. Non-device-flow public clients are disabled by default. Set ALLOW_PUBLIC_CLIENTS=\"true\" in the uds-operator-config Secret to enable them."
	}
	if client.String("protocol") == "saml" {
		return "cannot be a SAML public client. PKCE does not apply to SAML."
	}
	if client.Bool("serviceAccountsEnabled") {
		return "is a public client and cannot set serviceAccountsEnabled"
	}
	if hasSecret {
		return "is a public client and cannot set secret or secretConfig"
	}
	if client.Has("enableAuthserviceSelector") {
		return "is a public client and cannot set enableAuthserviceSelector"
	}
	if attributes.String("pkce.code.challenge.method") != "S256" {
		return "is a public client and must set \"pkce.code.challenge.method\" to \"S256\" (RFC 7636, case-sensitive)."
	}
	return ""
}
