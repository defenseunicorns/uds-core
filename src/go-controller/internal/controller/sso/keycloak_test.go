// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package sso

import (
	"context"
	"encoding/json"
	udstypes "github.com/defenseunicorns/uds-core/src/go-controller/api/uds/v1alpha1"
	"io"
	"k8s.io/utils/ptr"
	"net/http"
	"strings"
	"testing"
	"time"
)

func TestConversionPreservesUserAttributesAndExplicitScopeChoices(t *testing.T) {
	entry := udstypes.Sso{ClientID: "app", Attributes: map[string]string{"custom": "value"}, FullScopeAllowed: ptr.To(false), DefaultClientScopes: []string{}, EnableAuthserviceSelector: map[string]string{}}
	converted := convertSsoToClient(entry)
	if _, exists := entry.Attributes["uds.core.groups"]; exists {
		t.Fatal("conversion mutated cached Package attributes")
	}
	data, _ := json.Marshal(converted)
	var fields map[string]interface{}
	_ = json.Unmarshal(data, &fields)
	if fields["fullScopeAllowed"] != false || fields["defaultClientScopes"] == nil {
		t.Fatal("explicit false/empty scope choices lost")
	}
	if _, exists := fields["standardFlowEnabled"]; exists {
		t.Fatal("unspecified grant flow overwritten")
	}
	if got := resolveTemplate(`clientField(clientId):clientField(attributes)["custom"]:clientField(fullScopeAllowed):clientField(defaultClientScopes).json()`, converted); got != "app:value:false:[]" {
		t.Fatal(got)
	}
}

func TestUnchangedClientDoesNotPublishPUTOrRefetch(t *testing.T) {
	previous := managementHTTPClient
	t.Cleanup(func() { managementHTTPClient = previous; InvalidateToken() })
	tokenMu.Lock()
	cachedToken = "unit-token"
	tokenExpiry = time.Now().Add(time.Hour)
	tokenMu.Unlock()
	gets, puts := 0, 0
	existing := Client{ID: "provider-id", ClientID: "app", Secret: "preserved", Protocol: "openid-connect", StandardFlowEnabled: ptr.To(true), DefaultClientScopes: []string{"profile", "email"}, RedirectUris: []string{"https://app/callback"}, Attributes: map[string]string{"uds.core.groups": "[\"group\"]"}}
	managementHTTPClient = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.Method == "PUT" {
			puts++
			return &http.Response{StatusCode: 204, Body: io.NopCloser(strings.NewReader(""))}, nil
		}
		gets++
		data, _ := json.Marshal([]Client{existing})
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(string(data)))}, nil
	})}
	desired := existing
	desired.ID = ""
	desired.Secret = ""
	desired.StandardFlowEnabled = nil
	desired.DefaultClientScopes = nil
	for range 3 {
		result, err := syncClient(context.Background(), desired)
		if err != nil || result.Secret != "preserved" {
			t.Fatal(result, err)
		}
	}
	if puts != 0 || gets != 3 {
		t.Fatalf("unchanged sync issued %d PUTs and %d GETs", puts, gets)
	}
	desired.RedirectUris = []string{}
	if _, err := syncClient(context.Background(), desired); err != nil {
		t.Fatal(err)
	}
	if puts != 1 || gets != 5 {
		t.Fatalf("redirect revocation did not publish exactly once: %d/%d", puts, gets)
	}
}

func TestDesiredClientComparisonPreservesExplicitSecurityChanges(t *testing.T) {
	existing := Client{ClientID: "app", PublicClient: ptr.To(false), Enabled: ptr.To(true), RedirectUris: []string{"https://app/callback"}, DefaultClientScopes: []string{"openid"}, Attributes: map[string]string{"allow": "original"}}
	for _, desired := range []Client{{ClientID: "app", PublicClient: ptr.To(true)}, {ClientID: "app", Enabled: ptr.To(false)}, {ClientID: "app", RedirectUris: []string{}}, {ClientID: "app", DefaultClientScopes: []string{}}, {ClientID: "app", Attributes: map[string]string{"allow": "changed"}}} {
		if clientMatchesDesired(existing, desired) {
			t.Fatal("security-relevant desired change was treated as unchanged", desired)
		}
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
func TestSAMLSigningCertificateUsesFirstSigningKey(t *testing.T) {
	previous := managementHTTPClient
	t.Cleanup(func() { managementHTTPClient = previous })
	descriptor := `<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><md:IDPSSODescriptor><md:KeyDescriptor use="encryption"><ds:KeyInfo><ds:X509Data><ds:X509Certificate>ENCRYPTION</ds:X509Certificate></ds:X509Data></ds:KeyInfo></md:KeyDescriptor><md:KeyDescriptor use="signing"><ds:KeyInfo><ds:X509Data><ds:X509Certificate>ACTIVE
 CERT</ds:X509Certificate></ds:X509Data></ds:KeyInfo></md:KeyDescriptor><md:KeyDescriptor use="signing"><ds:KeyInfo><ds:X509Data><ds:X509Certificate>OLD</ds:X509Certificate></ds:X509Data></ds:KeyInfo></md:KeyDescriptor></md:IDPSSODescriptor></md:EntityDescriptor>`
	managementHTTPClient = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(descriptor))}, nil
	})}
	got, err := getSamlCertificate(context.Background())
	if err != nil || got != "ACTIVECERT" {
		t.Fatalf("incorrect active SAML certificate %q: %v", got, err)
	}
	descriptor = `<EntityDescriptor/>`
	if _, err := getSamlCertificate(context.Background()); err == nil {
		t.Fatal("missing signing certificate silently accepted")
	}
}
