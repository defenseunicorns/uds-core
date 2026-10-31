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

func TestLoginEndsFormSubmissionBeforeOIDCCallbackNavigation(t *testing.T) {
	target, _ := url.Parse("https://dex.internal")
	bridge := NewBridge(testDirectory(t), target, http.DefaultTransport, "sso.example.test", "/realms/uds")
	for _, candidate := range []string{
		"/realms/uds/protocol/openid-connect/auth?client_id=app&state=unmodified",
		"https://untrusted.example/callback", "//untrusted.example/callback", "/\\untrusted.example", "/\r\nLocation: https://untrusted.example", "/\t/untrusted.example", "/\x00/untrusted.example",
	} {
		t.Run(candidate, func(t *testing.T) {
			formPage := httptest.NewRecorder()
			bridge.loginForm(formPage, httptest.NewRequest("GET", "https://sso.example.test/realms/uds/account", nil))
			csrf := formPage.Result().Cookies()[0]
			form := url.Values{"username": {"doug"}, "password": {"test-password"}, "csrf": {csrf.Value}, "return": {candidate}}
			request := httptest.NewRequest("POST", "https://sso.example.test/login", strings.NewReader(form.Encode()))
			request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
			request.Header.Set("Origin", "https://sso.example.test")
			request.AddCookie(csrf)
			response := httptest.NewRecorder()
			bridge.login(response, request)
			if response.Code != 200 || response.Header().Get("Location") != "" {
				t.Fatal("login continued its form submission as a redirect")
			}
			if response.Header().Get("Content-Security-Policy") != loginCSP || response.Header().Get("Cache-Control") != "no-store" {
				t.Fatal("handoff relaxed the sign-in document restrictions")
			}
			expected := candidate
			if candidate != "/realms/uds/protocol/openid-connect/auth?client_id=app&state=unmodified" {
				expected = "/realms/uds/account"
			}
			body := html.UnescapeString(response.Body.String())
			if !strings.Contains(body, `content="0;url=`+expected+`"`) || !strings.Contains(body, `href="`+expected+`"`) {
				t.Fatal("handoff did not retain the validated local navigation")
			}
			var session *http.Cookie
			for _, cookie := range response.Result().Cookies() {
				if cookie.Name == SessionCookie {
					session = cookie
				}
			}
			if session == nil || !session.Secure || !session.HttpOnly || session.SameSite != http.SameSiteLaxMode || session.Domain != "" {
				t.Fatal("session cookie restrictions changed")
			}
			if _, ok := bridge.Sessions.Lookup(session.Value); !ok {
				t.Fatal("handoff did not establish authenticated session authority")
			}
		})
	}
}

func TestLoginHandoffStillRequiresCSRFAndExactOrigin(t *testing.T) {
	target, _ := url.Parse("https://dex.internal")
	bridge := NewBridge(testDirectory(t), target, http.DefaultTransport, "sso.example.test", "/realms/uds")
	for _, origin := range []string{"https://untrusted.example", "https://sso.example.test"} {
		request := httptest.NewRequest("POST", "https://sso.example.test/login", strings.NewReader("username=doug&password=test-password&csrf=untrusted"))
		request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		request.Header.Set("Origin", origin)
		response := httptest.NewRecorder()
		bridge.login(response, request)
		if response.Code != 403 || len(response.Result().Cookies()) != 0 {
			t.Fatal("untrusted sign-in request established session authority")
		}
	}
}
