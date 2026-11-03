// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package main

import (
	"bytes"
	"compress/gzip"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"

	"k8s.io/apimachinery/pkg/util/yaml"
)

func (c cluster) releaseSecrets(release string) ([]object, error) {
	selector := url.QueryEscape("owner=helm,name=" + release)
	raw, err := c.request(http.MethodGet, "/api/v1/namespaces/pepr-system/secrets?labelSelector="+selector, nil, true)
	if err != nil {
		return nil, err
	}
	if len(raw) == 0 {
		return nil, nil
	}
	var list struct {
		Items []object `json:"items"`
	}
	err = json.Unmarshal(raw, &list)
	// Kubernetes omits per-item TypeMeta in some collection responses.
	// This endpoint is specifically the v1 Secret collection.
	for _, item := range list.Items {
		item["apiVersion"] = "v1"
		item["kind"] = "Secret"
	}
	return list.Items, err
}
func decodeRelease(encoded string) (string, error) {
	outer, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return "", err
	}
	raw, err := base64.StdEncoding.DecodeString(string(outer))
	if err != nil {
		return "", err
	}
	if len(raw) > 2 && raw[0] == 0x1f && raw[1] == 0x8b {
		reader, err := gzip.NewReader(bytes.NewReader(raw))
		if err != nil {
			return "", err
		}
		defer reader.Close()
		raw, err = io.ReadAll(io.LimitReader(reader, 32<<20))
		if err != nil {
			return "", err
		}
	}
	var release struct {
		Manifest string `json:"manifest"`
	}
	err = json.Unmarshal(raw, &release)
	return release.Manifest, err
}
func (c cluster) releaseObjects(release string) ([]object, error) {
	secrets, err := c.releaseSecrets(release)
	if err != nil {
		return nil, err
	}
	var objects []object
	for _, o := range secrets {
		// Failed upgrades and superseded releases can leave resources behind.
		// Inspect every recorded manifest; deletion still checks live ownership.
		manifest, err := decodeRelease(str(o, "data", "release"))
		if err != nil {
			return nil, fmt.Errorf("invalid legacy Core Helm state: %w", err)
		}
		revision, err := manifestObjects(manifest)
		if err != nil {
			return nil, err
		}
		if release == "module" && !hasCoreModule(revision) {
			return nil, fmt.Errorf("legacy module history is not UDS Core; refusing retirement")
		}
		objects = append(objects, revision...)
	}
	return objects, nil
}

func manifestObjects(manifest string) ([]object, error) {
	decoder := yaml.NewYAMLOrJSONDecoder(bytes.NewBufferString(manifest), 4096)
	var objects []object
	for {
		var o object
		err := decoder.Decode(&o)
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, err
		}
		if len(o) > 0 {
			objects = append(objects, o)
		}
	}
	return objects, nil
}
