// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package devidentity

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"net/http"
	"net/url"
	"strings"
)

const csrfCookie = "UDS_IDENTITY_CSRF"

func localReturn(candidate, fallback string) string {
	if !strings.HasPrefix(candidate, "/") || strings.HasPrefix(candidate, "//") || strings.ContainsAny(candidate, "\\\r\n") {
		return fallback
	}
	// Browsers remove tabs and other control characters while parsing URLs.
	// Reject them before a path can normalize into an external authority.
	for _, char := range candidate {
		if char <= 0x20 || char == 0x7f {
			return fallback
		}
	}
	if _, err := url.ParseRequestURI(candidate); err != nil {
		return fallback
	}
	return candidate
}

func (b *Bridge) loginForm(writer http.ResponseWriter, request *http.Request) {
	target := localReturn(request.URL.RequestURI(), b.IssuerPath+"/account")
	if request.URL.Path == "/" {
		target = b.IssuerPath + "/account"
	}
	b.renderLoginForm(writer, http.StatusOK, loginPage{Return: target})
}

func (b *Bridge) renderLoginForm(writer http.ResponseWriter, status int, page loginPage) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		http.Error(writer, "Sign in unavailable", 503)
		return
	}
	csrf := base64.RawURLEncoding.EncodeToString(raw)
	page.CSRF = csrf
	http.SetCookie(writer, &http.Cookie{Name: csrfCookie, Value: csrf, Path: "/", Secure: true, HttpOnly: true, SameSite: http.SameSiteLaxMode, MaxAge: 300})
	renderIdentityPage(writer, status, "login", page)
}

func (b *Bridge) login(writer http.ResponseWriter, request *http.Request) {
	if request.Method != "POST" {
		writer.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	if origin := request.Header.Get("Origin"); origin != "" && origin != "https://"+b.PublicHost {
		http.Error(writer, "Invalid sign in origin", 403)
		return
	}
	request.Body = http.MaxBytesReader(writer, request.Body, 16384)
	if err := request.ParseForm(); err != nil {
		http.Error(writer, "Invalid sign in request", 400)
		return
	}
	cookie, err := request.Cookie(csrfCookie)
	if err != nil || len(cookie.Value) != 43 || subtle.ConstantTimeCompare([]byte(cookie.Value), []byte(request.Form.Get("csrf"))) != 1 {
		http.Error(writer, "Invalid sign in state", 403)
		return
	}
	user, err := b.Directory.Authenticate(request.Context(), request.Form.Get("username"), request.Form.Get("password"))
	if err != nil {
		b.renderLoginForm(writer, http.StatusUnauthorized, loginPage{
			Return:   localReturn(request.Form.Get("return"), b.IssuerPath+"/account"),
			Username: request.Form.Get("username"), Error: "Invalid username or password",
		})
		return
	}
	token, err := b.Sessions.CreateIdentity(request.Context(), user)
	if err != nil {
		http.Error(writer, "Sign in unavailable", 503)
		return
	}
	http.SetCookie(writer, &http.Cookie{Name: SessionCookie, Value: token, Path: "/", Secure: true, HttpOnly: true, SameSite: http.SameSiteLaxMode, MaxAge: 28800})
	http.SetCookie(writer, &http.Cookie{Name: csrfCookie, Value: "", Path: "/", Secure: true, HttpOnly: true, SameSite: http.SameSiteLaxMode, MaxAge: -1})
	// End the form submission on this origin. A new document navigation starts
	// the OIDC GET flow; Chromium otherwise applies form-action 'self' to the
	// entire POST redirect chain, including the registered app callback.
	renderIdentityPage(writer, http.StatusOK, "signed-in", localReturn(request.Form.Get("return"), b.IssuerPath+"/account"))
}
