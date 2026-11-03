// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package main

import (
	"bytes"
	"fmt"
	"net/http"
	"net/url"
	"strings"

	"k8s.io/apimachinery/pkg/util/httpstream"
	"k8s.io/client-go/tools/remotecommand"
)

// The packaged helper must not launch Zarf: its action-command shortcut is not
// an executable in the helper's working directory. Reuse the loaded REST config,
// including explicit kubeconfig, exec credentials, proxy, and TLS settings.
func (c cluster) podBuildInfo(name string) ([]byte, error) {
	if c.execPod != nil {
		return c.execPod(name)
	}
	if c.restConfig == nil {
		return nil, fmt.Errorf("Kubernetes configuration is required for controller exec")
	}
	endpoint, err := url.Parse(strings.TrimRight(c.restConfig.Host, "/") + "/api/v1/namespaces/uds-system/pods/" + url.PathEscape(name) + "/exec")
	if err != nil {
		return nil, err
	}
	query := endpoint.Query()
	query.Set("container", "controller")
	query.Set("stdout", "true")
	query.Set("stderr", "true")
	query.Add("command", "/usr/local/bin/uds-controller")
	query.Add("command", "--build-info")
	endpoint.RawQuery = query.Encode()
	websocket, err := remotecommand.NewWebSocketExecutor(c.restConfig, http.MethodGet, endpoint.String())
	if err != nil {
		return nil, err
	}
	spdy, err := remotecommand.NewSPDYExecutor(c.restConfig, http.MethodPost, endpoint)
	if err != nil {
		return nil, err
	}
	executor, err := remotecommand.NewFallbackExecutor(websocket, spdy, func(err error) bool {
		return httpstream.IsUpgradeFailure(err) || httpstream.IsHTTPSProxyError(err)
	})
	if err != nil {
		return nil, err
	}
	var stdout, stderr bytes.Buffer
	if err := executor.StreamWithContext(c.ctx, remotecommand.StreamOptions{Stdout: &stdout, Stderr: &stderr}); err != nil {
		return nil, fmt.Errorf("exec controller build-info: %w: %s", err, stderr.String())
	}
	return stdout.Bytes(), nil
}
