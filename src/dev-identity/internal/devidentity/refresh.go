// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package devidentity

import (
	"encoding/json"
	"net/http"
)

// Serve this handler only on the private mTLS listener. The listener's trust
// root and client identity scope belong to the platform, not tenant clients.
func (b *Bridge) IdentityRefresh(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet {
		writer.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	if request.TLS == nil || len(request.TLS.VerifiedChains) == 0 {
		writer.WriteHeader(http.StatusForbidden)
		return
	}
	user, err := b.Directory.Get(request.Context(), request.URL.Query().Get("userId"))
	if err != nil {
		writer.WriteHeader(http.StatusForbidden)
		return
	}
	writer.Header().Set("Content-Type", "application/json")
	writer.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(writer).Encode(struct {
		ID, Username, Email string
		Groups              []string
		EmailVerified       bool
		SessionVersion      uint64
	}{user.ID, user.Username, user.Email, user.Groups, user.EmailVerified, user.SessionVersion})
}
