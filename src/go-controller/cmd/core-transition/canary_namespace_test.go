// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestCanaryCleanupAcceptsAsynchronousNamespaceDeletion(t *testing.T) {
	namespace := object{"metadata": object{"name": "uds-core-admission-probe-test", "uid": "owned", "labels": object{"app.kubernetes.io/managed-by": "uds-core-transition"}}}
	gets, deletes := 0, 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/namespaces/uds-core-admission-probe-test" {
			t.Error("wrong cleanup target", r.URL)
		}
		if r.Method == http.MethodDelete {
			deletes++
			var options object
			if err := json.NewDecoder(r.Body).Decode(&options); err != nil {
				t.Error(err)
			}
			if str(options, "preconditions", "uid") != "owned" {
				t.Error("deletion lost UID guard")
			}
			namespace["metadata"].(object)["deletionTimestamp"] = "2026-11-02T00:00:00Z"
			w.WriteHeader(http.StatusAccepted)
		} else {
			gets++
		}
		// The namespace remains Terminating indefinitely while another API's
		// discovery is unavailable. Verification must not wait for that finalizer.
		json.NewEncoder(w).Encode(namespace)
	}))
	defer server.Close()
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	c := cluster{ctx: ctx, http: server.Client(), server: server.URL}
	if err := c.removeCanaryNamespace(namespace); err != nil {
		t.Fatal(err)
	}
	if gets != 1 || deletes != 1 {
		t.Fatal("cleanup waited for unrelated namespace finalization", gets, deletes)
	}
}
func TestCanaryCleanupRefusesForeignIdentityAndPropagatesDeleteFailure(t *testing.T) {
	for _, foreign := range []bool{false, true} {
		t.Run(map[bool]string{false: "delete forbidden", true: "foreign UID"}[foreign], func(t *testing.T) {
			original := object{"metadata": object{"name": "uds-core-admission-probe-test", "uid": "owned"}}
			deletes := 0
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Method == http.MethodDelete {
					deletes++
					w.WriteHeader(http.StatusForbidden)
					json.NewEncoder(w).Encode(object{"message": "deletion denied"})
					return
				}
				uid := "owned"
				if foreign {
					uid = "replacement"
				}
				json.NewEncoder(w).Encode(object{"metadata": object{"name": "uds-core-admission-probe-test", "uid": uid, "labels": object{"app.kubernetes.io/managed-by": "uds-core-transition"}}})
			}))
			defer server.Close()
			c := cluster{ctx: context.Background(), http: server.Client(), server: server.URL}
			if err := c.removeCanaryNamespace(original); err == nil {
				t.Fatal("unsafe/failed deletion was hidden")
			}
			if foreign && deletes != 0 {
				t.Fatal("deleted foreign namespace")
			}
		})
	}
}
