// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package devidentity

import (
	"context"
	"golang.org/x/crypto/bcrypt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"
)

func testDirectory(t *testing.T) *MemoryDirectory {
	t.Helper()
	hash, err := bcrypt.GenerateFromPassword([]byte("test-password"), bcrypt.MinCost)
	if err != nil {
		t.Fatal(err)
	}
	return NewMemoryDirectory([]User{{ID: "user-1", Username: "doug", Email: "doug@example.test", PasswordHash: hash, Groups: []string{"/UDS Core/Admin"}, Enabled: true}})
}

func TestDirectoryVerifiesCredentialsAndCopiesGroups(t *testing.T) {
	directory := testDirectory(t)
	if _, err := directory.Authenticate(context.Background(), "doug", "wrong"); err == nil {
		t.Fatal("wrong password accepted")
	}
	user, err := directory.Authenticate(context.Background(), "doug", "test-password")
	if err != nil {
		t.Fatal(err)
	}
	user.Groups[0] = "changed"
	saved, err := directory.Get(context.Background(), user.ID)
	if err != nil || saved.Groups[0] != "/UDS Core/Admin" {
		t.Fatal("caller mutated authority")
	}
}

func TestConnectorHeadersComeFromAuthenticatedDirectoryOnly(t *testing.T) {
	observed := make(chan http.Header, 2)
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { observed <- r.Header.Clone(); w.WriteHeader(200) }))
	defer upstream.Close()
	target, _ := url.Parse(upstream.URL)
	bridge := NewBridge(testDirectory(t), target, http.DefaultTransport, "sso.example.test", "/realms/uds")
	anonymous := httptest.NewRequest("GET", "https://sso.example.test/realms/uds/token", nil)
	anonymous.Header.Set("X-Remote-User", "untrusted")
	bridge.ServeHTTP(httptest.NewRecorder(), anonymous)
	if (<-observed).Get("X-Remote-User") != "" {
		t.Fatal("incoming identity header reached Dex")
	}
	token, err := bridge.Sessions.Create("user-1")
	if err != nil {
		t.Fatal(err)
	}
	callback := httptest.NewRequest("GET", "https://sso.example.test/realms/uds/callback/uds", nil)
	callback.AddCookie(&http.Cookie{Name: SessionCookie, Value: token})
	callback.Header.Set("X-Remote-Group", "untrusted")
	bridge.ServeHTTP(httptest.NewRecorder(), callback)
	header := <-observed
	if header.Get("X-Remote-User") != "doug" || header.Get("X-Remote-Group") != "/UDS Core/Admin" {
		t.Fatal("directory identity was not used")
	}
}

func TestSessionsExpireAndRevoke(t *testing.T) {
	sessions := NewSessions()
	now := time.Now()
	sessions.now = func() time.Time { return now }
	token, err := sessions.Create("user")
	if err != nil {
		t.Fatal(err)
	}
	sessions.Revoke(token)
	if _, ok := sessions.Lookup(token); ok {
		t.Fatal("revoked session remained active")
	}
	token, err = sessions.Create("user")
	if err != nil {
		t.Fatal(err)
	}
	now = now.Add(9 * time.Hour)
	if _, ok := sessions.Lookup(token); ok {
		t.Fatal("expired session remained active")
	}
}
