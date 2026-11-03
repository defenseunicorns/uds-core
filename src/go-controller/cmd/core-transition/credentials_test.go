// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"k8s.io/client-go/tools/clientcmd"
	clientcmdapi "k8s.io/client-go/tools/clientcmd/api"
)

func TestExistingKubeconfigAuthentication(t *testing.T) {
	for _, mode := range []string{"merged", "explicit", "exec"} {
		t.Run(mode, func(t *testing.T) {
			calls := 0
			server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls++
				if r.Header.Get("Authorization") != "Bearer fixture-token" {
					t.Error("existing authentication was not used")
				}
				if r.URL.Path != "/api/v1/namespaces/default/serviceaccounts/default" {
					t.Error("wrong API path", r.URL.Path)
				}
				w.Write([]byte(`{"kind":"Namespace","metadata":{"name":"default"}}`))
			}))
			defer server.Close()
			dir := t.TempDir()
			auth := &clientcmdapi.AuthInfo{Token: "fixture-token"}
			if mode == "exec" {
				plugin := filepath.Join(dir, "credential-plugin")
				script := "#!/bin/sh\nprintf '%s' '{\"apiVersion\":\"client.authentication.k8s.io/v1\",\"kind\":\"ExecCredential\",\"status\":{\"token\":\"fixture-token\"}}'\n"
				if err := os.WriteFile(plugin, []byte(script), 0700); err != nil {
					t.Fatal(err)
				}
				auth = &clientcmdapi.AuthInfo{Exec: &clientcmdapi.ExecConfig{Command: plugin, APIVersion: "client.authentication.k8s.io/v1", InteractiveMode: clientcmdapi.NeverExecInteractiveMode}}
			}
			config := clientcmdapi.Config{
				Clusters:  map[string]*clientcmdapi.Cluster{"fixture": {Server: server.URL, InsecureSkipTLSVerify: true}},
				Contexts:  map[string]*clientcmdapi.Context{"selected": {Cluster: "fixture", AuthInfo: "fixture"}},
				AuthInfos: map[string]*clientcmdapi.AuthInfo{"fixture": auth}, CurrentContext: "selected",
			}
			var paths []string
			if mode == "merged" {
				users := clientcmdapi.Config{AuthInfos: config.AuthInfos}
				config.AuthInfos = nil
				path := filepath.Join(dir, "users")
				if err := clientcmd.WriteToFile(users, path); err != nil {
					t.Fatal(err)
				}
				paths = append(paths, path)
			}
			configPath := filepath.Join(dir, "config with spaces")
			if err := clientcmd.WriteToFile(config, configPath); err != nil {
				t.Fatal(err)
			}
			paths = append(paths, configPath)
			env := configPath
			if mode == "merged" {
				env = paths[0] + string(os.PathListSeparator) + paths[1]
			}
			explicit := ""
			if mode == "explicit" {
				explicit = configPath
				env = filepath.Join(dir, "must-not-use")
			}
			t.Setenv("KUBECONFIG", env)
			before, err := os.ReadDir(dir)
			if err != nil {
				t.Fatal(err)
			}
			c := cluster{ctx: context.Background()}
			if err := c.initializeREST(explicit); err != nil {
				t.Fatal(err)
			}
			if _, err := c.get("serviceaccount", "default", "default"); err != nil {
				t.Fatal(err)
			}
			if calls != 1 {
				t.Fatal("request did not reach the configured cluster")
			}
			after, err := os.ReadDir(dir)
			if err != nil || len(before) != len(after) {
				t.Fatal("authentication created unexpected files", err)
			}
		})
	}
}

func TestExplicitMissingKubeconfigDoesNotFallBack(t *testing.T) {
	c := cluster{ctx: context.Background()}
	if err := c.initializeREST(filepath.Join(t.TempDir(), "missing")); err == nil {
		t.Fatal("missing explicit configuration silently fell back to another cluster")
	}
}
