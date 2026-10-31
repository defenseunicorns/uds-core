// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package main

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
)

func TestPrivateDNSExactAuthoritiesAndInputBoundaries(t *testing.T) {
	text, err := privateDNSContent("uds.dev", "admin.uds.dev")
	if err != nil {
		t.Fatal(err)
	}
	const expected = "rewrite stop name exact sso.uds.dev tenant-ingressgateway.istio-tenant-gateway.svc.cluster.local\nrewrite stop name exact keycloak.admin.uds.dev admin-ingressgateway.istio-admin-gateway.svc.cluster.local\n"
	if text != expected {
		t.Fatal("private authority rewrite differs from actual tested CoreDNS contract")
	}
	for _, invalid := range []string{"", "*.uds.dev", "https://uds.dev", "uds.dev\nrewrite name anything", " uds.dev", "UDS.DEV"} {
		if _, err := privateDNSContent(invalid, "admin.uds.dev"); err == nil {
			t.Fatalf("unsafe authority accepted %q", invalid)
		}
	}
	// Use individually valid labels to test the complete authority length,
	// rather than accidentally rejecting a single oversized label first.
	publicMaximum := strings.Repeat("a", 63) + "." + strings.Repeat("b", 63) + "." + strings.Repeat("c", 63) + "." + strings.Repeat("d", 57)
	adminMaximum := strings.Repeat("a", 63) + "." + strings.Repeat("b", 63) + "." + strings.Repeat("c", 63) + "." + strings.Repeat("d", 52)
	if len("sso."+publicMaximum) != 253 || len("keycloak."+adminMaximum) != 253 {
		t.Fatal("authority boundary fixture length changed")
	}
	if _, err := privateDNSContent(publicMaximum, adminMaximum); err != nil {
		t.Fatalf("maximum valid complete authorities rejected: %v", err)
	}
	for _, values := range [][2]string{{publicMaximum + "d", adminMaximum}, {publicMaximum, adminMaximum + "d"}, {strings.Repeat("a", 64) + ".dev", "admin.uds.dev"}, {"uds.dev", strings.Repeat("a", 64) + ".dev"}, {"uds..dev", "admin.uds.dev"}, {"-uds.dev", "admin.uds.dev"}, {"uds.dev", "admin-.uds.dev"}} {
		if _, err := privateDNSContent(values[0], values[1]); err == nil {
			t.Fatalf("invalid authority boundary accepted %q", values)
		}
	}
}

func TestPrivateDNSPreservesCustomKeysAndPinsUIDVersion(t *testing.T) {
	for _, mode := range []string{"create", "update", "no-data", "unchanged", "forbidden", "missing-uid", "conflict"} {
		t.Run(mode, func(t *testing.T) {
			writes := 0
			fakeKube(t, func(input interface{}, args ...string) ([]byte, error) {
				if args[0] == "get" {
					if mode == "create" {
						return nil, nil
					}
					if mode == "forbidden" {
						return nil, errors.New("forbidden")
					}
					obj := object("ConfigMap", "coredns-custom", "kube-system")
					obj["metadata"] = map[string]interface{}{"name": "coredns-custom", "namespace": "kube-system", "uid": "current-uid", "resourceVersion": "7", "labels": map[string]interface{}{"foreign": "kept"}}
					obj["binaryData"] = map[string]interface{}{"foreign.bin": "YQ=="}
					obj["data"] = map[string]interface{}{"foreign.override": "foreign", "other.server": "unrelated", "native-dev-identity.override": "old"}
					if mode == "unchanged" {
						mapAt(obj, "data")[privateDNSKey] = "desired"
					}
					if mode == "no-data" {
						delete(obj, "data")
					}
					if mode == "missing-uid" {
						delete(mapAt(obj, "metadata"), "uid")
					}
					return json.Marshal(obj)
				}
				writes++
				if args[0] == "create" {
					data := mapAt(input.(map[string]interface{}), "data")
					if len(data) != 1 || data[privateDNSKey] != "desired" {
						t.Fatal("new custom map has unexpected entries")
					}
					return []byte("created"), nil
				}
				if args[0] != "patch" {
					t.Fatalf("unexpected DNS mutation %v", args)
				}
				var patch []map[string]interface{}
				if err := json.Unmarshal([]byte(args[len(args)-1]), &patch); err != nil {
					t.Fatal(err)
				}
				if patch[0]["op"] != "test" || patch[0]["path"] != "/metadata/uid" || patch[0]["value"] != "current-uid" || patch[1]["path"] != "/metadata/resourceVersion" || patch[1]["value"] != "7" {
					t.Fatal("update lacks replacement/version guard")
				}
				for _, p := range patch[2:] {
					path := p["path"].(string)
					if path != "/data/"+privateDNSKey && !(mode == "no-data" && path == "/data") {
						t.Fatalf("unrelated CoreDNS config/metadata modified: %s", path)
					}
				}
				if mode == "conflict" {
					return nil, errors.New("resourceVersion conflict")
				}
				return []byte("patched"), nil
			})
			changed, err := writePrivateDNS("desired")
			wantError := mode == "forbidden" || mode == "missing-uid" || mode == "conflict"
			if (err != nil) != wantError {
				t.Fatalf("error handling changed %v", err)
			}
			if changed != (mode == "create" || mode == "update" || mode == "no-data") {
				t.Fatalf("change signal wrong %v", changed)
			}
			if (mode == "unchanged" || mode == "forbidden" || mode == "missing-uid") && writes != 0 {
				t.Fatal("unnecessary/unauthorized write")
			}
		})
	}
}

func TestPrivateDNSRequiresActualImportAndReadOnlyProjection(t *testing.T) {
	for _, mode := range []string{"supported", "missing-import", "wrong-mount", "wrong-map", "writable"} {
		t.Run(mode, func(t *testing.T) {
			fakeKube(t, func(input interface{}, args ...string) ([]byte, error) {
				if args[1] == "configmap" {
					corefile := ".:53 {\n import /etc/coredns/custom/*.override\n}\n"
					if mode == "missing-import" {
						corefile = ".:53 {}"
					}
					return json.Marshal(map[string]interface{}{"data": map[string]interface{}{"Corefile": corefile}})
				}
				name, path, readOnly := "coredns-custom", "/etc/coredns/custom", true
				if mode == "wrong-map" {
					name = "other"
				}
				if mode == "wrong-mount" {
					path = "/unsupported"
				}
				if mode == "writable" {
					readOnly = false
				}
				return json.Marshal(map[string]interface{}{"spec": map[string]interface{}{"template": map[string]interface{}{"spec": map[string]interface{}{"volumes": []interface{}{map[string]interface{}{"name": "custom-config-volume", "configMap": map[string]interface{}{"name": name}}}, "containers": []interface{}{map[string]interface{}{"volumeMounts": []interface{}{map[string]interface{}{"name": "custom-config-volume", "mountPath": path, "readOnly": readOnly}}}}}}}})
			})
			if err := privateDNSImports(); (err == nil) != (mode == "supported") {
				t.Fatalf("unsupported CoreDNS accepted %v", err)
			}
		})
	}
}

func TestPrivateDNSCannotAlterProductionOrBaseProfile(t *testing.T) {
	prior := readBuildLock
	t.Cleanup(func() { readBuildLock = prior })
	fakeKube(t, func(input interface{}, args ...string) ([]byte, error) {
		t.Fatal("nonprivate profile mutated/read cluster")
		return nil, nil
	})
	if err := privateDNS("install", "uds.dev", "admin.uds.dev", false); err != nil {
		t.Fatal(err)
	}
	for _, source := range []string{`{}`, `{"identityIncluded":true,"privateGatewayOverlay":{"profile":"production","serviceType":"LoadBalancer"}}`} {
		readBuildLock = func() ([]byte, error) { return []byte(source), nil }
		if err := privateDNS("install", "uds.dev", "admin.uds.dev", true); err == nil {
			t.Fatal("private DNS applied without explicit private identity profile")
		}
	}
}

func TestPrivateDNSVerifyUsesActualGatewayIPsAndHonorsCancellation(t *testing.T) {
	prior := resolvePrivateDNS
	t.Cleanup(func() { resolvePrivateDNS = prior })
	calls := 0
	resolvePrivateDNS = func(ctx context.Context, address, name string) ([]string, error) {
		calls++
		if address != "10.166.0.10" || !strings.HasSuffix(name, "uds.dev") {
			t.Fatal("verification bypassed real DNS server/public authority")
		}
		return []string{"10.166.108.176"}, nil
	}
	if err := waitPrivateDNS(context.Background(), "10.166.0.10", []privateAuthority{{Name: "sso.uds.dev", IP: "10.166.108.176"}}); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if err := waitPrivateDNS(ctx, "10.166.0.10", []privateAuthority{{Name: "sso.uds.dev", IP: "10.166.108.176"}}); !errors.Is(err, context.Canceled) {
		t.Fatal("cancellation lost", err)
	}
	if calls != 1 {
		t.Fatal("cancelled verification made another DNS request")
	}
}
