// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

// core-transition is an internal package installer helper. Runtime cluster access
// uses the private kubeconfig captured by the installer from its exact context.
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"time"
)

type object map[string]any

type cluster struct {
	ctx     context.Context
	http    *http.Client
	server  string
	zarf    string
	uds     bool
	execute func([]byte, ...string) ([]byte, error)
}

func (c cluster) command(input []byte, tools ...string) ([]byte, error) {
	if c.execute != nil {
		return c.execute(input, tools...)
	}
	prefix := []string{"tools"}
	if c.uds {
		prefix = []string{"zarf", "tools"}
	}
	cmd := exec.CommandContext(c.ctx, c.zarf, append(prefix, tools...)...)
	cmd.Stdin = bytes.NewReader(input)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("cluster transition command failed: %w: %s", err, stderr.String())
	}
	return stdout.Bytes(), nil
}
func (c cluster) kubectl(input []byte, args ...string) ([]byte, error) {
	if c.http != nil {
		return c.restCommand(input, args...)
	}
	return c.command(input, append([]string{"kubectl"}, args...)...)
}
func (c cluster) get(kind, namespace, name string) (object, error) {
	args := []string{"get", kind, name, "--ignore-not-found", "-o=json"}
	if namespace != "" {
		args = append(args, "--namespace", namespace)
	}
	raw, err := c.kubectl(nil, args...)
	if err != nil {
		return nil, err
	}
	if len(bytes.TrimSpace(raw)) == 0 {
		return nil, nil
	}
	var out object
	err = json.Unmarshal(raw, &out)
	return out, err
}
func (c cluster) list(kind, namespace string) ([]object, error) {
	args := []string{"get", kind, "-o=json"}
	if namespace != "" {
		args = append(args, "-n", namespace)
	}
	raw, err := c.kubectl(nil, args...)
	if err != nil {
		return nil, err
	}
	var out struct {
		Items []object `json:"items"`
	}
	err = json.Unmarshal(raw, &out)
	return out.Items, err
}
func get(o object, keys ...string) any {
	var value any = o
	for _, key := range keys {
		switch v := value.(type) {
		case object:
			value = v[key]
		case map[string]any:
			value = v[key]
		default:
			return nil
		}
	}
	return value
}
func str(o object, keys ...string) string { v, _ := get(o, keys...).(string); return v }
func meta(o object) object {
	v, _ := get(o, "metadata").(map[string]any)
	if v == nil {
		return object{}
	}
	return object(v)
}
func (c cluster) patch(kind, namespace, name string, patch any) error {
	raw, err := json.Marshal(patch)
	if err != nil {
		return err
	}
	args := []string{"patch", kind, name, "--type=json", "-p", string(raw)}
	if namespace != "" {
		args = append(args, "-n", namespace)
	}
	_, err = c.kubectl(nil, args...)
	return err
}
func preconditions(o object) []object {
	return []object{{"op": "test", "path": "/metadata/uid", "value": str(o, "metadata", "uid")}, {"op": "test", "path": "/metadata/resourceVersion", "value": str(o, "metadata", "resourceVersion")}}
}
func (c cluster) remove(o object) error {
	// Delete a fetched object with UID/resourceVersion, never a mutable name alone.
	body := object{"apiVersion": "v1", "kind": "DeleteOptions", "preconditions": object{"uid": str(o, "metadata", "uid"), "resourceVersion": str(o, "metadata", "resourceVersion")}, "propagationPolicy": "Foreground"}
	raw, err := json.Marshal(body)
	if err != nil {
		return err
	}
	// Keep immutable preconditions on the DELETE sent to the captured API target.
	path := str(o, "apiVersion")
	prefix := "/apis/" + path
	if path == "v1" {
		prefix = "/api/v1"
	}
	resource := resourceFor(str(o, "kind"))
	if resource == "" {
		return fmt.Errorf("refusing unsupported cleanup kind %s", str(o, "kind"))
	}
	ns := str(o, "metadata", "namespace")
	if ns != "" {
		prefix += "/namespaces/" + ns
	}
	// The command adapter also supports isolated tests without a live cluster.
	_, err = c.kubectl(raw, "delete", "--raw", prefix+"/"+resource+"/"+str(o, "metadata", "name"), "-f", "-")
	return err
}
func resourceFor(kind string) string {
	return map[string]string{"Deployment": "deployments", "Service": "services", "Secret": "secrets", "ConfigMap": "configmaps", "ServiceAccount": "serviceaccounts", "Role": "roles", "RoleBinding": "rolebindings", "ClusterRole": "clusterroles", "ClusterRoleBinding": "clusterrolebindings", "MutatingWebhookConfiguration": "mutatingwebhookconfigurations", "ValidatingWebhookConfiguration": "validatingwebhookconfigurations", "PeprStore": "peprstores", "HorizontalPodAutoscaler": "horizontalpodautoscalers", "ServiceMonitor": "servicemonitors", "PrometheusRule": "prometheusrules"}[kind]
}
func poll(ctx context.Context, fn func() (bool, error)) error {
	for {
		done, err := fn()
		if err != nil {
			return err
		}
		if done {
			return nil
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(time.Second):
		}
	}
}
func main() {
	var zarf, phase, contract, chart, kubeconfig string
	var uds bool
	flag.StringVar(&zarf, "zarf", "./zarf", "embedded Zarf CLI")
	flag.StringVar(&phase, "phase", "", "internal transition phase")
	flag.StringVar(&contract, "contract", "", "compiled native policy contract")
	flag.StringVar(&chart, "chart", "", "Core chart path for contract generation")
	flag.BoolVar(&uds, "uds", false, "CLI is the UDS wrapper")
	flag.StringVar(&kubeconfig, "kubeconfig", "", "private installer kubeconfig")
	flag.Parse()
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Minute)
	defer cancel()
	c := cluster{ctx: ctx, zarf: zarf, uds: uds}
	if phase != "contract" {
		if err := c.initializeREST(kubeconfig); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
	}
	var err error
	switch phase {
	case "contract":
		err = c.generateContract(chart, contract)
	case "preflight":
		err = c.preflight()
	case "api":
		err = c.adoptAPI()
	case "drain":
		err = c.drain()
	case "snapshot":
		err = c.snapshot()
	case "verify":
		err = c.verify(contract)
	case "retire":
		if err = c.verify(contract); err == nil {
			err = c.retire()
		}
	default:
		err = errors.New("unknown transition phase")
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func decodeStream(raw []byte) ([]object, error) {
	d := json.NewDecoder(bytes.NewReader(raw))
	var out []object
	for {
		var o object
		err := d.Decode(&o)
		if errors.Is(err, io.EOF) {
			return out, nil
		}
		if err != nil {
			return nil, err
		}
		if len(o) > 0 {
			out = append(out, o)
		}
	}
}
