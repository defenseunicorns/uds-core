// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestRetirementRetainsUnknownHistoricalKindsWithoutBlocking(t *testing.T) {
	for _, release := range []string{"module", "uds-operator-config"} {
		t.Run(release, func(t *testing.T) {
			manifest := "apiVersion: example.com/v1\nkind: HistoricalExtension\nmetadata:\n  name: retain-me\n"
			if release == "module" {
				manifest += "---\napiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: pepr-uds-core\n  namespace: pepr-system\nspec:\n  selector:\n    matchLabels:\n      app: pepr-uds-core\n      pepr.dev/controller: admission\n"
			}
			raw := encode(object{"manifest": manifest})
			encoded := base64.StdEncoding.EncodeToString([]byte(base64.StdEncoding.EncodeToString(raw)))
			deleted := false
			historyName := "sh.helm.release.v1." + release + ".v1"
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				switch {
				case r.URL.Path == "/api/v1/namespaces/pepr-system":
					json.NewEncoder(w).Encode(object{"metadata": object{"name": "pepr-system"}})
				case strings.HasSuffix(r.URL.Path, "/secrets"):
					items := []object{}
					if !deleted && r.URL.Query().Get("labelSelector") == "owner=helm,name="+release {
						items = append(items, object{"metadata": object{"name": historyName, "namespace": "pepr-system", "uid": "history", "resourceVersion": "1", "labels": object{"owner": "helm", "name": release}}, "data": object{"release": encoded}})
					}
					json.NewEncoder(w).Encode(object{"items": items})
				case strings.HasSuffix(r.URL.Path, "/secrets/"+historyName) && r.Method == "DELETE":
					var body object
					json.NewDecoder(r.Body).Decode(&body)
					if str(body, "preconditions", "uid") != "history" {
						t.Error("history cleanup lost identity")
					}
					deleted = true
					w.Write([]byte(`{}`))
				case strings.Contains(r.URL.Path, "/peprstores/"), strings.Contains(r.URL.Path, "/deployments/"):
					w.WriteHeader(404)
				default:
					t.Errorf("unknown kind was accessed or deleted: %s %s", r.Method, r.URL)
					w.WriteHeader(500)
				}
			}))
			defer server.Close()
			c := cluster{ctx: context.Background(), http: server.Client(), server: server.URL}
			if err := c.retire(); err != nil || !deleted {
				t.Fatal("unknown historical object blocked verified retirement", err)
			}
		})
	}
}
