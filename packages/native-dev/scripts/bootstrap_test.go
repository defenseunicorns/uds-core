// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package main

import (
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"testing"
)

func TestFreshTLSKeysHaveExactServerAndClientPurposes(t *testing.T) {
	keys, err := tlsData("uds.dev", "admin.uds.dev")
	if err != nil {
		t.Fatal(err)
	}
	rootBytes, _ := base64.StdEncoding.DecodeString(keys["ca.crt"])
	rootPEM, _ := pem.Decode(rootBytes)
	root, err := x509.ParseCertificate(rootPEM.Bytes)
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range []struct {
		name  string
		usage x509.ExtKeyUsage
		dns   string
	}{{"identity", x509.ExtKeyUsageServerAuth, "keycloak-http.keycloak.svc.cluster.local"}, {"identity", x509.ExtKeyUsageServerAuth, "sso.uds.dev"}, {"identity", x509.ExtKeyUsageServerAuth, "keycloak.admin.uds.dev"}, {"dex", x509.ExtKeyUsageServerAuth, "localhost"}, {"bridge-client", x509.ExtKeyUsageClientAuth, ""}, {"dex-client", x509.ExtKeyUsageClientAuth, ""}} {
		data, _ := base64.StdEncoding.DecodeString(keys[entry.name+".crt"])
		block, _ := pem.Decode(data)
		cert, err := x509.ParseCertificate(block.Bytes)
		if err != nil {
			t.Fatal(err)
		}
		roots := x509.NewCertPool()
		roots.AddCert(root)
		if _, err := cert.Verify(x509.VerifyOptions{Roots: roots, KeyUsages: []x509.ExtKeyUsage{entry.usage}, DNSName: entry.dns}); err != nil {
			t.Fatal(entry.name, err)
		}
		if keys[entry.name+".key"] == "" {
			t.Fatal("private key missing")
		}
	}
	another, err := tlsData("uds.dev", "admin.uds.dev")
	if err != nil {
		t.Fatal(err)
	}
	if keys["identity.key"] == another["identity.key"] {
		t.Fatal("independent cold boots reused identity authority")
	}
}
