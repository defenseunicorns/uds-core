// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package devidentity

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

func TestCookieCapabilityIsStatelessAndReportsUnsupported(t *testing.T) {
	target, _ := url.Parse("https://unused.invalid")
	bridge := NewBridge(nil, target, http.DefaultTransport, "sso.example.test", "/realms/uds")
	endpoint := "https://sso.example.test/realms/uds/protocol/openid-connect/3p-cookies/step1.html"
	request := httptest.NewRequest(http.MethodGet, endpoint, nil)
	request.Header.Set("Cookie", SessionCookie+"=private-session-value")
	response := httptest.NewRecorder()
	bridge.ServeHTTP(response, request)
	if response.Code != 200 || !strings.Contains(response.Body.String(), "postMessage('unsupported', '*')") || strings.Contains(response.Body.String(), "private-session-value") || strings.Contains(response.Body.String(), "document.cookie") || response.Header().Get("Set-Cookie") != "" {
		t.Fatal("capability response did not remain stateless", response.Code)
	}
	csp := response.Header().Get("Content-Security-Policy")
	if !strings.Contains(csp, "script-src 'sha256-") || strings.Contains(csp, "frame-ancestors") || response.Header().Get("X-Frame-Options") != "" {
		t.Fatal("capability response cannot execute safely in an embedding page", csp)
	}
	for _, method := range []string{http.MethodHead, http.MethodPost} {
		response = httptest.NewRecorder()
		bridge.ServeHTTP(response, httptest.NewRequest(method, endpoint, nil))
		expected := 200
		if method == http.MethodPost {
			expected = 405
		}
		if response.Code != expected || response.Body.Len() != 0 || response.Header().Get("Set-Cookie") != "" {
			t.Fatal("unexpected capability method behavior", method, response.Code)
		}
	}
}
