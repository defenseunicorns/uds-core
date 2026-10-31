// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package devidentity

import (
	"context"
	"encoding/json"
	"fmt"
	"reflect"
	"slices"
	"strings"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"
	"k8s.io/utils/ptr"
)

type CorePackageSource interface {
	GetCorePackage(context.Context, string, string) (*CorePackage, error)
}
type KubeCorePackages struct{ Client dynamic.Interface }

func (k KubeCorePackages) GetCorePackage(ctx context.Context, namespace, name string) (*CorePackage, error) {
	if k.Client == nil {
		return nil, fmt.Errorf("Core package reader unavailable")
	}
	object, err := k.Client.Resource(schema.GroupVersionResource{Group: "uds.dev", Version: "v1alpha1", Resource: "packages"}).Namespace(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return nil, err
	}
	var result CorePackage
	if err := runtime.DefaultUnstructuredConverter.FromUnstructured(object.Object, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

type CoreClientOwner struct {
	Namespace  string `json:"namespace"`
	Package    string `json:"package"`
	UID        string `json:"uid"`
	SpecSHA256 string `json:"specSHA256"`
}

func publicAudienceTargets(data map[string]any) []string {
	raw, _ := json.Marshal(data["protocolMappers"])
	var mappings []struct {
		Mapper string            `json:"protocolMapper"`
		Config map[string]string `json:"config"`
	}
	if json.Unmarshal(raw, &mappings) != nil {
		return nil
	}
	targets := []string{}
	for _, mapping := range mappings {
		if mapping.Mapper == "oidc-audience-mapper" && mapping.Config["id.token.claim"] == "true" {
			targets = append(targets, mapping.Config["included.client.audience"])
		}
	}
	return targets
}

func sameCoreOwner(a, b *CoreClientOwner) bool {
	return a != nil && b != nil && a.Namespace == b.Namespace && a.Package == b.Package && a.UID == b.UID
}

func (m *Management) authenticateCoreOwner(ctx context.Context, principal Principal, record *ClientRecord) error {
	attrs := clientAttributes(*record)
	reserved := false
	for key := range attrs {
		reserved = reserved || strings.HasPrefix(key, CoreOwnerPrefix)
	}
	if !reserved {
		record.CoreOwner = nil
		if len(publicAudienceTargets(record.Data)) != 0 {
			return fmt.Errorf("public audience pairing requires authoritative Core provenance")
		}
		return nil
	}
	if !m.Clients.CoreAudiencePairsEnabled {
		return fmt.Errorf("Core audience pairing is disabled without a verified provenance producer")
	}
	if principal.Role != "operator" || principal.Subject == "" {
		return fmt.Errorf("reserved Core provenance requires authenticated operator")
	}
	owner := &CoreClientOwner{Namespace: attrs[CoreOwnerPrefix+"namespace"], Package: attrs[CoreOwnerPrefix+"name"], UID: attrs[CoreOwnerPrefix+"uid"], SpecSHA256: attrs[CoreOwnerPrefix+"spec-sha256"]}
	record.CoreOwner = owner
	return m.Clients.validateCoreRecord(ctx, *record)
}

func (c *Clients) validateCoreRecord(ctx context.Context, record ClientRecord) error {
	owner := record.CoreOwner
	if owner != nil && !c.CoreAudiencePairsEnabled {
		return fmt.Errorf("Core audience pairing is disabled")
	}
	if owner == nil {
		if len(publicAudienceTargets(record.Data)) != 0 {
			return fmt.Errorf("unauthenticated audience provenance")
		}
		return nil
	}
	if c.Packages == nil || owner.Namespace == "" || owner.Package == "" || owner.UID == "" || owner.SpecSHA256 == "" {
		return fmt.Errorf("live Core package provenance unavailable")
	}
	pkg, err := c.Packages.GetCorePackage(ctx, owner.Namespace, owner.Package)
	if err != nil || pkg == nil || pkg.Namespace != owner.Namespace || pkg.Name != owner.Package || string(pkg.UID) != owner.UID || pkg.DeletionTimestamp != nil {
		return fmt.Errorf("Core package authority changed")
	}
	var found *Sso
	for i := range pkg.Spec.Sso {
		if pkg.Spec.Sso[i].ClientID == record.ClientID() {
			if found != nil {
				return fmt.Errorf("ambiguous Core client")
			}
			found = &pkg.Spec.Sso[i]
		}
	}
	if found == nil || CoreClientSpecDigest(*found) != owner.SpecSHA256 {
		return fmt.Errorf("Core client specification changed")
	}
	expected := CanonicalClientProjection(*found)
	// Management's documented omitted-value defaults are the same ones used
	// for an ordinary client. Generated id/secret are never pairing authority.
	for key, value := range map[string]any{"protocol": "openid-connect", "enabled": true, "publicClient": false, "standardFlowEnabled": true} {
		if _, ok := expected[key]; !ok {
			expected[key] = value
		}
	}
	actual := make(map[string]any, len(record.Data))
	for key, value := range record.Data {
		actual[key] = value
	}
	attributes := clientAttributes(record)
	for key := range attributes {
		if strings.HasPrefix(key, CoreOwnerPrefix) {
			delete(attributes, key)
		}
	}
	actual["attributes"] = attributes
	normalized := func(value any) any {
		raw, _ := json.Marshal(value)
		var out any
		_ = json.Unmarshal(raw, &out)
		return out
	}
	delete(actual, "id")
	if _, declared := expected["secret"]; !declared {
		delete(actual, "secret")
	}
	if !reflect.DeepEqual(normalized(expected), normalized(actual)) {
		return fmt.Errorf("client representation differs from authoritative Core spec")
	}
	if len(publicAudienceTargets(record.Data)) == 0 {
		return nil
	}
	if !ptr.Deref(found.PublicClient, false) || !ptr.Deref(found.Enabled, true) || !ptr.Deref(found.StandardFlowEnabled, true) || ptr.Deref(found.ServiceAccountsEnabled, false) ||
		found.Secret != nil || found.SecretConfig != nil || found.EnableAuthserviceSelector != nil || found.Attributes["pkce.code.challenge.method"] != "S256" || record.Secret() != "" || record.Data["directAccessGrantsEnabled"] == true {
		return fmt.Errorf("invalid public S256 audience peer")
	}
	for _, target := range publicAudienceTargets(record.Data) {
		allowed := false
		for _, server := range pkg.Spec.Sso {
			if server.ClientID == target && !ptr.Deref(server.PublicClient, false) && ptr.Deref(server.Enabled, true) && ptr.Deref(server.StandardFlowEnabled, true) && !ptr.Deref(server.ServiceAccountsEnabled, false) && server.EnableAuthserviceSelector != nil && (server.Protocol == nil || string(*server.Protocol) == "openid-connect") {
				allowed = true
			}
		}
		if target == record.ClientID() || !allowed {
			return fmt.Errorf("audience target is not the Core-owned confidential server")
		}
	}
	return nil
}

func (m *Management) validatePublishedCorePair(ctx context.Context, client ClientRecord) error {
	if err := m.Clients.validateCoreRecord(ctx, client); err != nil {
		return err
	}
	if len(publicAudienceTargets(client.Data)) == 0 {
		return nil
	}
	records, err := m.Clients.readRecords(ctx)
	if err != nil {
		return err
	}
	for _, targetID := range publicAudienceTargets(client.Data) {
		found := false
		for _, target := range records {
			if target.ClientID() == targetID && !target.Public() && target.Enabled() && sameCoreOwner(target.CoreOwner, client.CoreOwner) && slices.Contains(trustedPeers(target, records), client.DexID()) {
				if err := m.Clients.validateCoreRecord(ctx, target); err != nil {
					return err
				}
				if err := m.Clients.requireRecordPublished(ctx, target, records); err != nil {
					return err
				}
				found = true
			}
		}
		if !found {
			return fmt.Errorf("paired Core server is not published")
		}
	}
	return nil
}
