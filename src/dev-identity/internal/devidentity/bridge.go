// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package devidentity

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strconv"
	"strings"
)

const SessionCookie = "KEYCLOAK_SESSION"

type userContextKey struct{}

type Bridge struct {
	Directory       Directory
	Sessions        *Sessions
	PublicHost      string
	IssuerPath      string
	Proxy           *httputil.ReverseProxy
	Admin           *Management
	JSONGroupHeader bool
	ManagedDefaults bool
}

func NewBridge(directory Directory, upstream *url.URL, transport http.RoundTripper, publicHost, issuerPath string) *Bridge {
	proxy := httputil.NewSingleHostReverseProxy(upstream)
	bridge := &Bridge{Directory: directory, Sessions: NewSessions(), PublicHost: publicHost, IssuerPath: issuerPath, Proxy: proxy}
	proxy.Transport = transport
	proxy.ModifyResponse = bridge.protocolResponse
	original := proxy.Director
	proxy.Director = func(request *http.Request) {
		original(request)
		for name := range request.Header {
			if strings.HasPrefix(strings.ToLower(name), "x-remote-") {
				request.Header.Del(name)
			}
		}
		if user, ok := request.Context().Value(userContextKey{}).(User); ok {
			request.Header.Set("X-Remote-User", user.Username)
			request.Header.Set("X-Remote-User-Id", user.ID)
			request.Header.Set("X-Remote-User-Name", user.Username)
			request.Header.Set("X-Remote-User-Email", user.Email)
			request.Header.Set("X-Remote-Email-Verified", strconv.FormatBool(user.EmailVerified))
			request.Header.Set("X-Remote-Session-Version", strconv.FormatUint(user.SessionVersion, 10))
			request.Header.Set("X-Remote-Group", strings.Join(user.Groups, ","))
			if bridge.JSONGroupHeader {
				raw, _ := json.Marshal(user.Groups)
				request.Header.Set("X-Remote-Group", string(raw))
			}
		}
	}
	return bridge
}

func (b *Bridge) user(request *http.Request) (User, bool) {
	cookie, err := request.Cookie(SessionCookie)
	if err != nil {
		return User{}, false
	}
	id, version, ok := b.Sessions.LookupIdentity(request.Context(), cookie.Value)
	if !ok {
		return User{}, false
	}
	user, err := b.Directory.Get(request.Context(), id)
	return user, err == nil && user.SessionVersion == version && (user.Realm == "" || user.Realm == "uds")
}

func (b *Bridge) ServeHTTP(writer http.ResponseWriter, request *http.Request) {
	if b.publicProtocolHeaders(writer, request) {
		return
	}
	if b.Admin != nil && b.Admin.ServeHTTP(writer, request) {
		return
	}
	if b.Admin != nil && (request.URL.Path == b.IssuerPath+"/auth" || request.URL.Path == b.IssuerPath+"/protocol/openid-connect/auth") {
		if err := b.Admin.checkPKCEAuth(request.Context(), request); err != nil {
			http.Error(writer, "OIDC client policy denied", http.StatusBadRequest)
			return
		}
		user, ok := b.user(request)
		if !ok {
			b.loginForm(writer, request)
			return
		}
		if err := b.Admin.UserAllowed(request.Context(), request.URL.Query().Get("client_id"), user); err != nil {
			http.Error(writer, "Client access denied", http.StatusForbidden)
			return
		}
		if b.ManagedDefaults {
			query := request.URL.Query()
			scopes, err := b.Admin.InteractiveScopes(request.Context(), query.Get("client_id"), query.Get("scope"))
			if err != nil {
				http.Error(writer, "Client scope configuration unavailable", http.StatusForbidden)
				return
			}
			query.Set("scope", scopes)
			request.URL.RawQuery = query.Encode()
		}
	}
	switch request.URL.Path {
	case "/", b.IssuerPath + "/account":
		if request.Method != http.MethodGet {
			writer.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		if user, ok := b.user(request); ok {
			writer.Header().Set("Content-Type", "text/html; charset=utf-8")
			fmt.Fprint(writer, "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><title>UDS account</title></head><body><main><h1>UDS account</h1><p>Authenticated</p></main></body></html>")
			_ = user
			return
		}
		b.loginForm(writer, request)
		return
	case "/login":
		b.login(writer, request)
		return
	case b.IssuerPath + "/protocol/openid-connect/logout":
		if b.Admin != nil {
			if user, ok := b.user(request); ok {
				if err := b.Admin.EndUserSessions(request.Context(), user.ID); err != nil {
					http.Error(writer, "Sign out unavailable", 503)
					return
				}
			}
		}
		if cookie, err := request.Cookie(SessionCookie); err == nil {
			if err := b.Sessions.RevokeContext(request.Context(), cookie.Value); err != nil {
				http.Error(writer, "Sign out unavailable", 503)
				return
			}
		}
		http.SetCookie(writer, &http.Cookie{Name: SessionCookie, Value: "", Path: "/", Secure: true, HttpOnly: true, MaxAge: -1, SameSite: http.SameSiteLaxMode})
		writer.Header().Set("Content-Type", "text/html; charset=utf-8")
		writer.Header().Set("Cache-Control", "no-store")
		fmt.Fprintf(writer, "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><title>UDS sign out</title></head><body><main><h1>Signed out</h1><p>You are logged out</p><a href=\"%s/account\">Sign in</a></main></body></html>", b.IssuerPath)
		return
	}
	// Only the connector callback receives authenticated identity headers.
	if strings.HasPrefix(request.URL.Path, b.IssuerPath+"/callback/") {
		user, ok := b.user(request)
		if !ok {
			b.loginForm(writer, request)
			return
		}
		request = request.WithContext(context.WithValue(request.Context(), userContextKey{}, user))
	}
	// Keycloak's public endpoint spellings map to the actual Dex endpoints.
	replacements := map[string]string{
		"/protocol/openid-connect/auth": "/auth", "/protocol/openid-connect/token": "/token",
		"/protocol/openid-connect/certs": "/keys", "/protocol/openid-connect/userinfo": "/userinfo",
	}
	for old, next := range replacements {
		if request.URL.Path == b.IssuerPath+old {
			request.URL.Path = b.IssuerPath + next
			break
		}
	}
	b.Proxy.ServeHTTP(writer, request)
}
