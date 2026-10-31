// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package devidentity

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"golang.org/x/crypto/bcrypt"
)

func TestCredentialResetFencesLoginAlreadyInFlightAndLaterReenable(t *testing.T) {
	m, _, _, _ := managementFixture(t)
	user, err := testDirectory(t).Authenticate(t.Context(), "doug", "test-password")
	if err != nil {
		t.Fatal(err)
	}
	if err := m.Directory.Save(t.Context(), user); err != nil {
		t.Fatal(err)
	}
	inFlight, err := m.Directory.Authenticate(t.Context(), "doug", "test-password")
	if err != nil {
		t.Fatal(err)
	}
	user.PasswordHash, err = bcrypt.GenerateFromPassword([]byte("replacement-password"), bcrypt.MinCost)
	if err != nil {
		t.Fatal(err)
	}
	if err := m.Directory.Save(t.Context(), user); err != nil {
		t.Fatal(err)
	}
	stale, err := m.Sessions.CreateIdentity(t.Context(), inFlight)
	if err != nil {
		t.Fatal(err)
	}
	target, _ := url.Parse("http://unused.invalid")
	bridge := NewBridge(m.Directory, target, http.DefaultTransport, m.PublicHost, "/realms/uds")
	bridge.Sessions = m.Sessions
	request := httptest.NewRequest("GET", "https://"+m.PublicHost+"/realms/uds/account", nil)
	request.AddCookie(&http.Cookie{Name: SessionCookie, Value: stale})
	if _, ok := bridge.user(request); ok {
		t.Fatal("login authorized before a password reset crossed the revocation fence")
	}
	user, err = m.Directory.Authenticate(t.Context(), "doug", "replacement-password")
	if err != nil {
		t.Fatal(err)
	}
	active, err := m.Sessions.CreateIdentity(t.Context(), user)
	if err != nil {
		t.Fatal(err)
	}
	user.Enabled = false
	if err := m.Directory.Save(t.Context(), user); err != nil {
		t.Fatal(err)
	}
	user.Enabled = true
	if err := m.Directory.Save(t.Context(), user); err != nil {
		t.Fatal(err)
	}
	request = httptest.NewRequest("GET", "https://"+m.PublicHost+"/realms/uds/account", nil)
	request.AddCookie(&http.Cookie{Name: SessionCookie, Value: active})
	if _, ok := bridge.user(request); ok {
		t.Fatal("reenabling a user resumed a session revoked by disablement")
	}
}
