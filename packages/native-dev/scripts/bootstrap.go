// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

func main() {
	if len(os.Args) < 2 {
		fail(errors.New("bootstrap subcommand required"))
	}
	flags := flag.NewFlagSet(os.Args[1], flag.ExitOnError)
	phase := flags.String("phase", "", "readiness phase")
	installer := flags.String("installer", "system:admin", "authenticated bootstrap installer")
	identity := flags.Bool("identity", true, "include development identity")
	domain := flags.String("domain", "uds.dev", "public domain")
	admin := flags.String("admin-domain", "admin.uds.dev", "admin domain")
	identityNamespace := flags.String("identity-namespace", "keycloak", "installed native identity namespace")
	_ = flags.Parse(os.Args[2:])
	var err error
	switch os.Args[1] {
	case "preflight":
		err = preflight(*installer)
	case "fence":
		var documents []map[string]interface{}
		documents, err = fenceDocuments(*installer)
		if err == nil {
			err = json.NewEncoder(os.Stdout).Encode(map[string]interface{}{"apiVersion": "v1", "kind": "List", "items": documents})
		}
	case "trust":
		err = trust(*domain, *admin, *identity)
	case "gate":
		err = gate(*phase, *identity)
	case "mutations":
		err = mutationBootstrap(*identity)
	case "finish":
		err = finish(*identity)
	case "fleet-authority":
		err = restoreFleetAuthority(*identityNamespace)
	case "private-dns":
		err = privateDNS(*phase, *domain, *admin, *identity)
	default:
		err = errors.New("unknown bootstrap subcommand")
	}
	if err != nil {
		fail(err)
	}
}
func fail(err error) { fmt.Fprintln(os.Stderr, err); os.Exit(1) }

var kube = kubectl
var errNotFound = errors.New("Kubernetes object not found")

func kubectl(input interface{}, args ...string) ([]byte, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 150*time.Second)
	defer cancel()
	filename, prefix, err := bootstrapCLI()
	if err != nil {
		return nil, err
	}
	cmd := exec.CommandContext(ctx, filename, append(prefix, args...)...)
	if input != nil {
		data, err := json.Marshal(input)
		if err != nil {
			return nil, err
		}
		cmd.Stdin = bytes.NewReader(data)
	}
	var diagnostics bytes.Buffer
	cmd.Stderr = &diagnostics
	output, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("Kubernetes bootstrap operation failed: %s: %w", strings.TrimSpace(diagnostics.String()), err)
	}
	return output, nil
}

func bootstrapCLI() (string, []string, error) {
	filename := os.Getenv("UDS_NATIVE_BOOTSTRAP_CLI")
	if !filepath.IsAbs(filename) {
		return "", nil, errors.New("UDS_NATIVE_BOOTSTRAP_CLI must name an explicit trusted absolute executable")
	}
	info, err := os.Stat(filename)
	if err != nil {
		return "", nil, fmt.Errorf("read native bootstrap CLI: %w", err)
	}
	if !info.Mode().IsRegular() || info.Mode().Perm()&0111 == 0 {
		return "", nil, errors.New("native bootstrap CLI is not executable")
	}
	prefix := []string{"tools", "kubectl", "--request-timeout=15s"}
	switch os.Getenv("UDS_NATIVE_BOOTSTRAP_CLI_MODE") {
	case "", "uds":
		prefix = append([]string{"zarf"}, prefix...)
	case "zarf":
	default:
		return "", nil, errors.New("native bootstrap CLI mode must be uds or zarf")
	}
	return filename, prefix, nil
}
func apply(obj interface{}) error { _, err := kube(obj, "apply", "-f", "-"); return err }
func get(kind, namespace, name string) (map[string]interface{}, error) {
	args := []string{"get", kind, name, "--ignore-not-found", "-o", "json"}
	if namespace != "" {
		args = append(args, "-n", namespace)
	}
	data, err := kube(nil, args...)
	if err != nil {
		return nil, err
	}
	if len(bytes.TrimSpace(data)) == 0 {
		return nil, fmt.Errorf("%s %s/%s: %w", kind, namespace, name, errNotFound)
	}
	var obj map[string]interface{}
	err = json.Unmarshal(data, &obj)
	return obj, err
}
func object(kind, name, namespace string) map[string]interface{} {
	metadata := map[string]interface{}{"name": name}
	if namespace != "" {
		metadata["namespace"] = namespace
	}
	return map[string]interface{}{"apiVersion": "v1", "kind": kind, "metadata": metadata}
}
func mapAt(obj map[string]interface{}, path ...string) map[string]interface{} {
	for _, key := range path {
		next, _ := obj[key].(map[string]interface{})
		obj = next
	}
	return obj
}
func namespace(name string) error { return apply(object("Namespace", name, "")) }

func trust(domain, admin string, identity bool) error {
	namespaces := []string{"istio-system", "uds-system", "uds-policy-exemptions", "monitoring"}
	if identity {
		namespaces = append(namespaces, "keycloak")
	}
	for _, name := range namespaces {
		if err := namespace(name); err != nil {
			return err
		}
	}
	if identity {
		if _, err := get("secret", "keycloak", "uds-native-identity-tls"); errors.Is(err, errNotFound) {
			data, err := tlsData(domain, admin)
			if err != nil {
				return err
			}
			secret := object("Secret", "uds-native-identity-tls", "keycloak")
			secret["data"] = data
			if err := apply(secret); err != nil {
				return err
			}
		} else if err != nil {
			return err
		}
	}
	cm := object("ConfigMap", "uds-trust-bundle", "istio-system")
	cm["data"] = map[string]string{"extra.pem": ""}
	// An already managed trust bundle retains its current data during retries.
	if _, err := get("configmap", "istio-system", "uds-trust-bundle"); errors.Is(err, errNotFound) {
		if err := apply(cm); err != nil {
			return err
		}
	} else if err != nil {
		return err
	}
	return nil
}
