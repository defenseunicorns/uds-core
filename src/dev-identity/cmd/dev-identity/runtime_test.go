// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package main

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/defenseunicorns/uds-core/src/dev-identity/internal/devidentity"
)

func TestRouterRejectsUnknownBrowserOriginsAndPreservesBackchannel(t *testing.T) {
	calls := 0
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { calls++; w.WriteHeader(202) }))
	defer upstream.Close()
	target, _ := url.Parse(upstream.URL)
	router := &hostRouter{public: devidentity.NewBridge(nil, target, http.DefaultTransport, "sso.example.test", "/realms/uds"), admin: devidentity.NewBridge(nil, target, http.DefaultTransport, "keycloak.admin.example.test", "/realms/uds")}
	paths := []string{"/", "/login", "/realms/uds/account", "/realms/uds/auth", "/realms/uds/protocol/openid-connect/auth", "/realms/uds/.well-known/openid-configuration", "/realms/uds/callback/uds", "/admin/master/console/", "/realms/uds/protocol/openid-connect/3p-cookies/step1.html"}
	for _, path := range paths {
		request := httptest.NewRequest("GET", "https://sso-alt.example.test"+path, nil)
		request.Header.Set("X-Forwarded-Host", "sso.example.test")
		response := httptest.NewRecorder()
		router.ServeHTTP(response, request)
		if response.Code != 421 || len(response.Result().Cookies()) != 0 || calls != 0 {
			t.Fatal("unconfigured browser origin reached an issuer", path, response.Code, calls)
		}
	}
	for _, host := range []string{router.public.PublicHost, router.admin.PublicHost} {
		request := httptest.NewRequest("GET", "https://"+host+"/realms/uds/.well-known/openid-configuration", nil)
		response := httptest.NewRecorder()
		router.ServeHTTP(response, request)
		if response.Code != 202 {
			t.Fatal("configured issuer rejected", host, response.Code)
		}
	}
	for _, path := range []string{"/admin/realms/uds/clients", "/realms/uds/protocol/openid-connect/token", "/realms/uds/protocol/openid-connect/certs", "/realms/uds/protocol/openid-connect/userinfo"} {
		request := httptest.NewRequest("GET", "http://keycloak-http.keycloak.svc.cluster.local:8080"+path, nil)
		response := httptest.NewRecorder()
		router.ServeHTTP(response, request)
		if response.Code != 202 {
			t.Fatal("backchannel route rejected", path, response.Code)
		}
	}
}
