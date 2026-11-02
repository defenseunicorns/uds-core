// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestPreflightReportsEveryNonRE2MatcherBeforeDrain(t *testing.T) {
	for _, invalid := range []bool{false, true} {
		calls := 0
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Method != http.MethodGet {
				t.Errorf("preflight wrote %s", r.Method)
			}
			if r.URL.Path != "/apis/uds.dev/v1alpha1/exemptions" {
				t.Errorf("unexpected request %s", r.URL)
			}
			calls++
			pattern := "prometheus"
			name := "first"
			metadata := object{}
			if calls == 1 {
				metadata["continue"] = "next"
				if invalid {
					pattern = "(?<=prefix)app"
				}
			} else {
				name = "second"
				if invalid {
					pattern = "(app)-\\1"
				}
				if r.URL.Query().Get("continue") != "next" {
					t.Error("lost pagination")
				}
			}
			json.NewEncoder(w).Encode(object{"apiVersion": "uds.dev/v1alpha1", "kind": "ExemptionList", "metadata": metadata, "items": []object{{"apiVersion": "uds.dev/v1alpha1", "kind": "Exemption", "metadata": object{"namespace": "tenant", "name": name}, "spec": object{"exemptions": []object{{"matcher": object{"name": pattern}}}}}}})
		}))
		c := cluster{ctx: context.Background(), http: server.Client(), server: server.URL}
		err := c.preflightExemptions()
		server.Close()
		if calls != 2 {
			t.Fatalf("pages: %d", calls)
		}
		if !invalid {
			if err != nil {
				t.Fatal(err)
			}
			continue
		}
		if err == nil {
			t.Fatal("accepted historical ECMAScript patterns")
		}
		for _, expected := range []string{"tenant/first", "tenant/second", "matcher[0]", "(?<=prefix)app", "existing operator has not been stopped", "https://github.com/google/re2/wiki/Syntax"} {
			if !strings.Contains(err.Error(), expected) {
				t.Errorf("missing %q in %v", expected, err)
			}
		}
	}
}
