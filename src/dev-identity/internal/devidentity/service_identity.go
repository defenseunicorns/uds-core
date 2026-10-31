// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package devidentity

import (
	"encoding/json"
	"net/http"
)

// ServiceIdentity runs on the private mTLS listener. Dex has already verified
// the requesting client's secret; this lookup supplies only managed claims
// and configured audiences, never request-supplied identity assertions.
func (m *Management) ServiceIdentity(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet {
		writer.WriteHeader(405)
		return
	}
	if request.TLS == nil || len(request.TLS.VerifiedChains) == 0 {
		writer.WriteHeader(403)
		return
	}
	client, snapshot, err := m.Clients.PublishedClient(request.Context(), "uds", request.URL.Query().Get("clientId"))
	if err != nil || !client.Enabled() || client.Public() || client.Data["serviceAccountsEnabled"] != true {
		writer.WriteHeader(403)
		return
	}
	if err := m.Clients.requireRecordPublished(request.Context(), client, snapshot); err != nil {
		writer.WriteHeader(503)
		return
	}
	for _, audience := range serviceAudiences(client) {
		found := false
		for _, target := range snapshot {
			if target.Realm == client.Realm && target.ClientID() == audience && !target.Deleted && target.Enabled() {
				found = m.Clients.requireRecordPublished(request.Context(), target, snapshot) == nil
				break
			}
		}
		if !found {
			writer.WriteHeader(503)
			return
		}
	}
	writer.Header().Set("Content-Type", "application/json")
	writer.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(writer).Encode(struct {
		ClientID, ID, Username string
		Groups, Audiences      []string
	}{client.ClientID(), "service-account-" + client.ID(), "service-account-" + client.ClientID(), []string{}, serviceAudiences(client)})
}
