// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package authpolicy

import (
	udstypes "github.com/defenseunicorns/uds-core/src/go-controller/api/uds/v1alpha1"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/config"
	"k8s.io/utils/ptr"
	"reflect"
	"testing"
)

func TestGeneratedSourcesKeepExactCIDRsAndNamespaceIdentity(t *testing.T) {
	old := config.Get()
	t.Cleanup(func() { config.Replace(old) })
	config.Replace(config.Config{DiscoveredAPICIDRs: []string{"192.0.2.10/32"}, APIServiceCIDRs: []string{"10.43.0.1/32"}})
	source := buildAllowSource(udstypes.Allow{RemoteGenerated: ptr.To(udstypes.KubeAPI)}, "apps")
	if !reflect.DeepEqual(source["ipBlocks"], []interface{}{"10.43.0.1/32", "192.0.2.10/32"}) {
		t.Fatal("API policy is not scoped to discovered addresses", source)
	}
	source = buildAllowSource(udstypes.Allow{RemoteGenerated: ptr.To(udstypes.IntraNamespace)}, "apps")
	if !reflect.DeepEqual(source["namespaces"], []interface{}{"apps"}) {
		t.Fatal(source)
	}
	pkg := &udstypes.UDSPackage{Spec: udstypes.Spec{Sso: []udstypes.Sso{{ClientID: "wide", EnableAuthserviceSelector: map[string]string{}}}}}
	if findMatchingSsoClient(pkg, map[string]string{"app": "demo"}, udstypes.Ambient) == nil {
		t.Fatal("namespace-wide authservice selector not honored")
	}
}
