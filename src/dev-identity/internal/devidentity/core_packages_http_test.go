// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package devidentity

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/rest"
)

func TestCorePackageReaderUsesTheUDSAPIGroup(t *testing.T) {
	const expected = "/apis/uds.dev/v1alpha1/namespaces/review/packages/paired"
	path := ""
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path = r.URL.Path
		if path != expected {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"apiVersion":"uds.dev/v1alpha1","kind":"Package","metadata":{"namespace":"review","name":"paired","uid":"authoritative-owner"},"spec":{"sso":[]}}`)
	}))
	defer server.Close()
	client, err := dynamic.NewForConfig(&rest.Config{Host: server.URL})
	if err != nil {
		t.Fatal(err)
	}
	pkg, err := (KubeCorePackages{Client: client}).GetCorePackage(t.Context(), "review", "paired")
	if err != nil {
		t.Fatalf("authoritative Package lookup used %q rather than %q: %v", path, expected, err)
	}
	if path != expected || pkg == nil || pkg.Namespace != "review" || pkg.Name != "paired" || string(pkg.UID) != "authoritative-owner" {
		t.Fatal("reader lost exact Package authority", path, pkg)
	}
}

func TestCorePackageReaderDoesNotTurnReadFailuresIntoAuthority(t *testing.T) {
	for _, code := range []int{http.StatusNotFound, http.StatusServiceUnavailable} {
		t.Run(fmt.Sprint(code), func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(code)
				fmt.Fprintf(w, `{"kind":"Status","apiVersion":"v1","status":"Failure","message":"authority unavailable","code":%d}`, code)
			}))
			defer server.Close()
			client, err := dynamic.NewForConfig(&rest.Config{Host: server.URL})
			if err != nil {
				t.Fatal(err)
			}
			pkg, err := (KubeCorePackages{Client: client}).GetCorePackage(t.Context(), "review", "paired")
			if err == nil || pkg != nil {
				t.Fatal("failed API read produced Package authority", pkg, err)
			}
		})
	}
}
