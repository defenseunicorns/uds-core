// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"regexp"
	"strings"
	"time"
)

const privateDNSKey = "native-dev-identity.override"

type privateAuthority struct{ Name, Service, IP string }

func privateDNS(phase, domain, admin string, identity bool) error {
	if !identity {
		return nil
	}
	if phase != "install" && phase != "verify" {
		return errors.New("private DNS phase must be install or verify")
	}
	data, err := readBuildLock()
	if err != nil {
		return err
	}
	var lock struct {
		IdentityIncluded bool                                  `json:"identityIncluded"`
		Overlay          struct{ Profile, ServiceType string } `json:"privateGatewayOverlay"`
	}
	if err := json.Unmarshal(data, &lock); err != nil {
		return err
	}
	if !lock.IdentityIncluded || lock.Overlay.Profile != "private-development-guest" || lock.Overlay.ServiceType != "ClusterIP" {
		return errors.New("private identity DNS requires the explicit private ClusterIP profile")
	}
	content, err := privateDNSContent(domain, admin)
	if err != nil {
		return err
	}
	if err := privateDNSImports(); err != nil {
		return err
	}
	changed, err := writePrivateDNS(content)
	if err != nil {
		return err
	}
	if changed {
		if _, err := kube(nil, "rollout", "restart", "deployment/coredns", "-n", "kube-system"); err != nil {
			return err
		}
	}
	if _, err := kube(nil, "rollout", "status", "deployment/coredns", "-n", "kube-system", "--timeout=120s"); err != nil {
		return err
	}
	dns, err := get("service", "kube-system", "kube-dns")
	if err != nil {
		return err
	}
	address, _ := mapAt(dns, "spec")["clusterIP"].(string)
	if net.ParseIP(address) == nil {
		return errors.New("real kube-dns service IP missing")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	if phase == "install" {
		api, err := get("service", "default", "kubernetes")
		if err != nil {
			return err
		}
		ip, _ := mapAt(api, "spec")["clusterIP"].(string)
		if net.ParseIP(ip) == nil {
			return errors.New("real API service IP missing")
		}
		return waitPrivateDNS(ctx, address, []privateAuthority{{Name: "kubernetes.default.svc.cluster.local", IP: ip}})
	}
	authorities, err := privateAuthorities(domain, admin)
	if err != nil {
		return err
	}
	return waitPrivateDNS(ctx, address, authorities)
}

func privateDNSContent(domain, admin string) (string, error) {
	for _, value := range []string{"sso." + domain, "keycloak." + admin} {
		if !validPrivateDomain(value) {
			return "", errors.New("private DNS domains must be exact DNS names")
		}
	}
	return fmt.Sprintf("rewrite stop name exact sso.%s tenant-ingressgateway.istio-tenant-gateway.svc.cluster.local\nrewrite stop name exact keycloak.%s admin-ingressgateway.istio-admin-gateway.svc.cluster.local\n", domain, admin), nil
}

func validPrivateDomain(value string) bool {
	// Keep this standalone helper standard-library-only, like the rest of the
	// cold bootstrap binary. Validate the complete prefixed authority.
	if value == "" || len(value) > 253 || strings.TrimSpace(value) != value {
		return false
	}
	label := regexp.MustCompile(`^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$`)
	for _, part := range strings.Split(value, ".") {
		if !label.MatchString(part) {
			return false
		}
	}
	return true
}

func privateDNSImports() error {
	core, err := get("configmap", "kube-system", "coredns")
	if err != nil {
		return err
	}
	corefile, _ := mapAt(core, "data")["Corefile"].(string)
	if !regexp.MustCompile(`(?m)^\s*import\s+/etc/coredns/custom/\*\.override\s*$`).MatchString(corefile) {
		return errors.New("CoreDNS does not import the supported custom override path")
	}
	deployment, err := get("deployment", "kube-system", "coredns")
	if err != nil {
		return err
	}
	spec := mapAt(deployment, "spec", "template", "spec")
	volumes, _ := spec["volumes"].([]interface{})
	names := map[string]bool{}
	for _, value := range volumes {
		v, _ := value.(map[string]interface{})
		if mapAt(v, "configMap")["name"] == "coredns-custom" {
			name, _ := v["name"].(string)
			names[name] = true
		}
	}
	containers, _ := spec["containers"].([]interface{})
	for _, value := range containers {
		container, _ := value.(map[string]interface{})
		mounts, _ := container["volumeMounts"].([]interface{})
		for _, entry := range mounts {
			mount, _ := entry.(map[string]interface{})
			name, _ := mount["name"].(string)
			if names[name] && mount["mountPath"] == "/etc/coredns/custom" && mount["readOnly"] == true {
				return nil
			}
		}
	}
	return errors.New("CoreDNS lacks the actual read-only coredns-custom projection")
}

func privateAuthorities(domain, admin string) ([]privateAuthority, error) {
	var result []privateAuthority
	for _, entry := range []struct{ authority, namespace, service string }{{"sso." + domain, "istio-tenant-gateway", "tenant-ingressgateway"}, {"keycloak." + admin, "istio-admin-gateway", "admin-ingressgateway"}} {
		svc, err := get("service", entry.namespace, entry.service)
		if err != nil {
			return nil, err
		}
		spec := mapAt(svc, "spec")
		ip, _ := spec["clusterIP"].(string)
		if spec["type"] != "ClusterIP" || net.ParseIP(ip) == nil {
			return nil, errors.New("private authority target is not a real ClusterIP gateway service")
		}
		result = append(result, privateAuthority{Name: entry.authority, Service: entry.service + "." + entry.namespace + ".svc.cluster.local", IP: ip})
	}
	return result, nil
}

func writePrivateDNS(content string) (bool, error) {
	current, err := get("configmap", "kube-system", "coredns-custom")
	if errors.Is(err, errNotFound) {
		obj := object("ConfigMap", "coredns-custom", "kube-system")
		obj["data"] = map[string]interface{}{privateDNSKey: content}
		_, err = kube(obj, "create", "-f", "-")
		return err == nil, err
	}
	if err != nil {
		return false, err
	}
	if mapAt(current, "data")[privateDNSKey] == content {
		return false, nil
	}
	metadata := mapAt(current, "metadata")
	uid, _ := metadata["uid"].(string)
	version, _ := metadata["resourceVersion"].(string)
	if uid == "" || version == "" {
		return false, errors.New("private DNS update requires real ConfigMap UID/resourceVersion")
	}
	patch := []map[string]interface{}{{"op": "test", "path": "/metadata/uid", "value": uid}, {"op": "test", "path": "/metadata/resourceVersion", "value": version}}
	if mapAt(current, "data") == nil {
		patch = append(patch, map[string]interface{}{"op": "add", "path": "/data", "value": map[string]interface{}{}})
	}
	patch = append(patch, map[string]interface{}{"op": "add", "path": "/data/" + privateDNSKey, "value": content})
	body, err := json.Marshal(patch)
	if err != nil {
		return false, err
	}
	_, err = kube(nil, "patch", "configmap", "coredns-custom", "-n", "kube-system", "--type=json", "-p", string(body))
	return err == nil, err
}

var resolvePrivateDNS = func(ctx context.Context, address, name string) ([]string, error) {
	resolver := &net.Resolver{PreferGo: true, Dial: func(ctx context.Context, network, _ string) (net.Conn, error) {
		return (&net.Dialer{Timeout: 2 * time.Second}).DialContext(ctx, network, net.JoinHostPort(address, "53"))
	}}
	return resolver.LookupHost(ctx, name)
}

func waitPrivateDNS(ctx context.Context, address string, authorities []privateAuthority) error {
	for {
		if err := ctx.Err(); err != nil {
			return fmt.Errorf("private identity DNS did not converge: %w", err)
		}
		ready := true
		for _, authority := range authorities {
			values, err := resolvePrivateDNS(ctx, address, authority.Name)
			matched := false
			for _, value := range values {
				if value == authority.IP {
					matched = true
				}
			}
			if err != nil || !matched {
				ready = false
			}
		}
		if ready {
			return nil
		}
		select {
		case <-ctx.Done():
			return fmt.Errorf("private identity DNS did not converge: %w", ctx.Err())
		case <-time.After(time.Second):
		}
	}
}
