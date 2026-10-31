// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package devidentity

import (
	"html"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

func TestLoginStylesAreReadOnlyAndDoNotIssueAuthority(t *testing.T) {
	target, _ := url.Parse("https://dex.invalid")
	bridge := NewBridge(testDirectory(t), target, nil, "sso.example.test", "/realms/uds")
	for _, method := range []string{http.MethodGet, http.MethodHead, http.MethodPost} {
		t.Run(method, func(t *testing.T) {
			response := httptest.NewRecorder()
			bridge.ServeHTTP(response, httptest.NewRequest(method, "https://sso.example.test"+loginStylesPath, nil))
			if len(response.Result().Cookies()) != 0 {
				t.Fatal("a public stylesheet issued authentication cookies")
			}
			if method == http.MethodPost {
				if response.Code != 405 || response.Header().Get("Allow") != "GET, HEAD" {
					t.Fatal("stylesheet accepted a write method")
				}
				return
			}
			if response.Code != 200 || response.Header().Get("Content-Type") != "text/css; charset=utf-8" || response.Header().Get("X-Content-Type-Options") != "nosniff" {
				t.Fatal("stylesheet did not return a typed local asset")
			}
			if method == http.MethodHead && response.Body.Len() != 0 {
				t.Fatal("HEAD returned a stylesheet body")
			}
			if method == http.MethodGet && !strings.Contains(response.Body.String(), ".auth-card") {
				t.Fatal("embedded sign-in styles were not served")
			}
		})
	}
}

func TestInvalidLoginEscapesInputAndPreservesOnlyLocalNavigation(t *testing.T) {
	target, _ := url.Parse("https://dex.invalid")
	bridge := NewBridge(testDirectory(t), target, nil, "sso.example.test", "/realms/uds")
	for _, returnTo := range []string{"/realms/uds/auth?state=original&client_id=app", "https://untrusted.example/callback"} {
		t.Run(returnTo, func(t *testing.T) {
			initial := httptest.NewRecorder()
			bridge.loginForm(initial, httptest.NewRequest("GET", "https://sso.example.test/", nil))
			csrf := initial.Result().Cookies()[0]
			username := `<script>alert("unsafe")</script>`
			form := url.Values{"username": {username}, "password": {"never-echo-this-password"}, "csrf": {csrf.Value}, "return": {returnTo}}
			request := httptest.NewRequest("POST", "https://sso.example.test/login", strings.NewReader(form.Encode()))
			request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
			request.Header.Set("Origin", "https://sso.example.test")
			request.AddCookie(csrf)
			response := httptest.NewRecorder()
			bridge.login(response, request)
			body := response.Body.String()
			if response.Code != 401 || !strings.Contains(body, `role="alert"`) || strings.Contains(body, username) || strings.Contains(body, "never-echo-this-password") {
				t.Fatal("invalid credentials were not rendered safely")
			}
			expected := returnTo
			if strings.HasPrefix(returnTo, "https:") {
				expected = "/realms/uds/account"
			}
			if !strings.Contains(html.UnescapeString(body), `name="return" value="`+expected+`"`) {
				t.Fatal("login retry changed or widened the navigation target")
			}
			cookies := response.Result().Cookies()
			if len(cookies) != 1 || cookies[0].Name != csrfCookie || cookies[0].Value == csrf.Value || !cookies[0].Secure || !cookies[0].HttpOnly {
				t.Fatal("login retry did not rotate only the protected CSRF cookie")
			}
			policy := response.Header().Get("Content-Security-Policy")
			if !strings.Contains(policy, "default-src 'none'") || !strings.Contains(policy, "style-src 'self'") || strings.Contains(policy, "unsafe-") || response.Header().Get("Cache-Control") != "no-store" {
				t.Fatal("login theming relaxed the document boundary")
			}
		})
	}
}
