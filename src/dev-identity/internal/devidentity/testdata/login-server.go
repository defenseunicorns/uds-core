// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

// Browser fixture: real bridge handlers and sessions, an in-memory directory,
// and a local callback stand-in. No cluster or external identity service.
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"os/signal"
	"strings"
	"syscall"

	"github.com/defenseunicorns/uds-core/src/dev-identity/internal/devidentity"
	"golang.org/x/crypto/bcrypt"
)

func main() {
	callback := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || r.URL.Query().Get("state") != "unchanged" {
			http.Error(w, "Invalid callback navigation", 400)
			return
		}
		if _, err := r.Cookie(devidentity.SessionCookie); err == nil {
			http.Error(w, "Identity cookie escaped its host", 400)
			return
		}
		fmt.Fprint(w, "<!doctype html><title>Application</title><h1>Application callback</h1>")
	}))
	defer callback.Close()
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Remote-User") != "doug" {
			http.Error(w, "Authenticated identity missing", 401)
			return
		}
		http.Redirect(w, r, callback.URL+"/callback?state="+url.QueryEscape(r.URL.Query().Get("state")), http.StatusFound)
	}))
	defer upstream.Close()
	server := httptest.NewUnstartedServer(nil)
	target, err := url.Parse(upstream.URL)
	if err != nil {
		panic(err)
	}
	hash, err := bcrypt.GenerateFromPassword([]byte("test-password"), bcrypt.MinCost)
	if err != nil {
		panic(err)
	}
	directory := devidentity.NewMemoryDirectory([]devidentity.User{{ID: "browser-user", Username: "doug", Email: "doug@example.test", PasswordHash: hash, Enabled: true}})
	host := strings.Replace(server.Listener.Addr().String(), "127.0.0.1", "localhost", 1)
	server.Config.Handler = devidentity.NewBridge(directory, target, http.DefaultTransport, host, "/realms/uds")
	server.StartTLS()
	defer server.Close()
	if err := json.NewEncoder(os.Stdout).Encode(map[string]string{"url": "https://" + host, "callback": callback.URL + "/callback?state=unchanged"}); err != nil {
		panic(err)
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	<-ctx.Done()
}
