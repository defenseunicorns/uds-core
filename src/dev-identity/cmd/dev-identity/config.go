// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package main

import (
	"bytes"
	"crypto/x509"
	"encoding/json"
	"fmt"
	"os"

	"github.com/defenseunicorns/uds-core/src/dev-identity/internal/devidentity"
)

type apiConnection struct {
	Address    string `json:"address"`
	RootCA     string `json:"rootCA"`
	ClientCert string `json:"clientCert"`
	ClientKey  string `json:"clientKey"`
	ServerName string `json:"serverName"`
}

type configuration struct {
	Namespace                string                     `json:"namespace"`
	PublicHost               string                     `json:"publicHost"`
	AdminHost                string                     `json:"adminHost"`
	IssuerPath               string                     `json:"issuerPath"`
	DexUpstream              string                     `json:"dexUpstream"`
	AdminDexUpstream         string                     `json:"adminDexUpstream"`
	DexRootCA                string                     `json:"dexRootCA"`
	ServingCert              string                     `json:"servingCert"`
	ServingKey               string                     `json:"servingKey"`
	RefreshClientCA          string                     `json:"refreshClientCA"`
	DexAPIs                  []apiConnection            `json:"dexAPIs"`
	Users                    []devidentity.User         `json:"users"`
	Clients                  []devidentity.ClientRecord `json:"clients"`
	FleetAudience            string                     `json:"fleetAudience"`
	FleetClientEnabled       bool                       `json:"fleetClientEnabled"`
	FleetNamespace           string                     `json:"fleetNamespace"`
	FleetServiceAccount      string                     `json:"fleetServiceAccount"`
	OperatorNamespace        string                     `json:"operatorNamespace"`
	OperatorServiceAccount   string                     `json:"operatorServiceAccount"`
	CoreAudiencePairsEnabled bool                       `json:"coreAudiencePairsEnabled"`
	PasswordOnly             bool                       `json:"passwordOnly"`
}

func readConfiguration(path string) (configuration, error) {
	var cfg configuration
	raw, err := os.ReadFile(path)
	if err != nil {
		return cfg, err
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&cfg); err != nil {
		return cfg, err
	}
	if !cfg.PasswordOnly {
		return cfg, fmt.Errorf("native identity requires the explicit password-only development authentication profile")
	}
	if cfg.Namespace == "" || cfg.PublicHost == "" || cfg.IssuerPath != "/realms/uds" || len(cfg.DexAPIs) == 0 {
		return cfg, fmt.Errorf("namespace, publicHost, /realms/uds issuerPath, and TLS Dex APIs are required")
	}
	if cfg.AdminHost != "" && (cfg.AdminDexUpstream == "" || len(cfg.DexAPIs) < 2) {
		return cfg, fmt.Errorf("adminHost requires a separate real Dex issuer and management API")
	}
	return cfg, nil
}

func rootPool(file string) (*x509.CertPool, error) {
	raw, err := os.ReadFile(file)
	if err != nil {
		return nil, err
	}
	roots := x509.NewCertPool()
	if !roots.AppendCertsFromPEM(raw) {
		return nil, fmt.Errorf("invalid identity trust root")
	}
	return roots, nil
}
