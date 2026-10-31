// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package main

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/base64"
	"encoding/pem"
	"math/big"
	"time"
)

func tlsData(domain, admin string) (map[string]string, error) {
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return nil, err
	}
	serial, _ := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	now := time.Now()
	ca := &x509.Certificate{SerialNumber: serial, Subject: pkix.Name{CommonName: "UDS native development identity CA"}, NotBefore: now.Add(-time.Minute), NotAfter: now.Add(365 * 24 * time.Hour), IsCA: true, BasicConstraintsValid: true, KeyUsage: x509.KeyUsageCertSign | x509.KeyUsageCRLSign}
	raw, err := x509.CreateCertificate(rand.Reader, ca, ca, &key.PublicKey, key)
	if err != nil {
		return nil, err
	}
	caPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: raw})
	cert, err := x509.ParseCertificate(raw)
	if err != nil {
		return nil, err
	}
	result := map[string]string{"ca.crt": base64.StdEncoding.EncodeToString(caPEM)}
	for _, entry := range []struct {
		name  string
		usage x509.ExtKeyUsage
		hosts []string
	}{{"identity", x509.ExtKeyUsageServerAuth, []string{"localhost", "sso." + domain, "keycloak." + admin, "keycloak-http", "keycloak-http.keycloak", "keycloak-http.keycloak.svc", "keycloak-http.keycloak.svc.cluster.local"}}, {"dex", x509.ExtKeyUsageServerAuth, []string{"localhost"}}, {"bridge-client", x509.ExtKeyUsageClientAuth, nil}, {"dex-client", x509.ExtKeyUsageClientAuth, nil}} {
		child, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
		if err != nil {
			return nil, err
		}
		number, _ := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
		template := &x509.Certificate{SerialNumber: number, Subject: pkix.Name{CommonName: entry.name}, DNSNames: entry.hosts, NotBefore: ca.NotBefore, NotAfter: ca.NotAfter, KeyUsage: x509.KeyUsageDigitalSignature, ExtKeyUsage: []x509.ExtKeyUsage{entry.usage}}
		der, err := x509.CreateCertificate(rand.Reader, template, cert, &child.PublicKey, key)
		if err != nil {
			return nil, err
		}
		pk, err := x509.MarshalPKCS8PrivateKey(child)
		if err != nil {
			return nil, err
		}
		result[entry.name+".crt"] = base64.StdEncoding.EncodeToString(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der}))
		result[entry.name+".key"] = base64.StdEncoding.EncodeToString(pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: pk}))
	}
	return result, nil
}
