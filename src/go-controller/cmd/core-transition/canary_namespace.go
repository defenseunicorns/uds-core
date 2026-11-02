// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package main

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
)

func (c cluster) createCanaryNamespace() (object, error) {
	request := object{"apiVersion": "v1", "kind": "Namespace", "metadata": object{
		"generateName": "uds-core-admission-probe-",
		"labels":       object{"app.kubernetes.io/managed-by": "uds-core-transition"},
	}}
	body, err := json.Marshal(request)
	if err != nil {
		return nil, err
	}
	raw, err := c.request(http.MethodPost, "/api/v1/namespaces", body, false)
	if err != nil {
		return nil, err
	}
	var namespace object
	if err := json.Unmarshal(raw, &namespace); err != nil {
		return nil, err
	}
	if !strings.HasPrefix(str(namespace, "metadata", "name"), "uds-core-admission-probe-") || str(namespace, "metadata", "uid") == "" {
		return nil, fmt.Errorf("API did not return an owned canary namespace identity")
	}
	return namespace, nil
}

func (c cluster) removeCanaryNamespace(namespace object) error {
	name, uid := str(namespace, "metadata", "name"), str(namespace, "metadata", "uid")
	if !strings.HasPrefix(name, "uds-core-admission-probe-") || uid == "" {
		return fmt.Errorf("refusing cleanup without canary namespace identity")
	}
	live, err := c.get("namespace", "", name)
	if err != nil || live == nil {
		return err
	}
	if str(live, "metadata", "uid") != uid || str(live, "metadata", "labels", "app.kubernetes.io/managed-by") != "uds-core-transition" {
		return fmt.Errorf("canary namespace ownership changed; refusing cleanup")
	}
	body, err := json.Marshal(object{"apiVersion": "v1", "kind": "DeleteOptions", "preconditions": object{"uid": uid}})
	if err != nil {
		return err
	}
	if _, err := c.request(http.MethodDelete, "/api/v1/namespaces/"+url.PathEscape(name), body, false); err != nil {
		return err
	}
	// Namespace deletion is asynchronous. Its finalizer waits for discovery and
	// collection across every namespaced API, including unrelated aggregated APIs.
	// An accepted UID-guarded deletion is sufficient cleanup intent; waiting for
	// final disappearance must not invalidate successful admission verification.
	slog.Info("Admission probe namespace deletion accepted", "namespace", name, "uid", uid)
	return nil
}
