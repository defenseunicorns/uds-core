// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package devidentity

import (
	"context"
	"encoding/json"
	"fmt"
	"slices"
	"sync"

	api "github.com/dexidp/dex/api/v2"
	"google.golang.org/grpc"
)

type DexClients interface {
	ListClients(context.Context, *api.ListClientReq, ...grpc.CallOption) (*api.ListClientResp, error)
	GetClient(context.Context, *api.GetClientReq, ...grpc.CallOption) (*api.GetClientResp, error)
	CreateClient(context.Context, *api.CreateClientReq, ...grpc.CallOption) (*api.CreateClientResp, error)
	UpdateClient(context.Context, *api.UpdateClientReq, ...grpc.CallOption) (*api.UpdateClientResp, error)
	DeleteClient(context.Context, *api.DeleteClientReq, ...grpc.CallOption) (*api.DeleteClientResp, error)
}

// Full Keycloak representations remain bridge-owned; only supported OIDC
// fields are sent through Dex's official gRPC API. Desired state survives
// process replacement and is reconciled after a partial API failure.
type ClientRecord struct {
	Realm     string           `json:"realm"`
	Data      map[string]any   `json:"data"`
	CoreOwner *CoreClientOwner `json:"coreOwner,omitempty"`
	Deleted   bool             `json:"deleted,omitempty"`
}

func (c ClientRecord) ID() string       { value, _ := c.Data["id"].(string); return value }
func (c ClientRecord) ClientID() string { value, _ := c.Data["clientId"].(string); return value }
func (c ClientRecord) Secret() string   { value, _ := c.Data["secret"].(string); return value }
func (c ClientRecord) Public() bool     { value, _ := c.Data["publicClient"].(bool); return value }
func (c ClientRecord) Enabled() bool {
	value, exists := c.Data["enabled"]
	return !exists || value == true
}
func (c ClientRecord) DexID() string {
	if c.Realm == "uds" {
		return c.ClientID()
	}
	return c.Realm + ":" + c.ClientID()
}

func stringsField(fields map[string]any, key string) []string {
	values, ok := fields[key].([]any)
	if !ok {
		if strings, ok := fields[key].([]string); ok {
			return strings
		}
		return nil
	}
	result := make([]string, 0, len(values))
	for _, value := range values {
		if text, ok := value.(string); ok {
			result = append(result, text)
		}
	}
	return result
}

type Clients struct {
	store    StateStore
	Packages CorePackageSource
	// Enable only with an authenticated operator that emits the verified pair contract.
	CoreAudiencePairsEnabled bool
	dex                      []DexClients
	mu                       sync.Mutex
}

func NewClients(store StateStore, dex DexClients) *Clients { return NewReplicatedClients(store, dex) }
func NewReplicatedClients(store StateStore, dex ...DexClients) *Clients {
	return &Clients{store: store, dex: dex}
}

func (c *Clients) List(ctx context.Context, realm string) ([]ClientRecord, error) {
	raw, err := c.store.List(ctx, "client")
	if err != nil {
		return nil, err
	}
	result := []ClientRecord{}
	for _, item := range raw {
		var record ClientRecord
		if err := json.Unmarshal(item, &record); err != nil {
			return nil, err
		}
		if !record.Deleted && (realm == "" || record.Realm == realm) {
			result = append(result, record)
		}
	}
	return result, nil
}

func (c *Clients) Get(ctx context.Context, realm, id string) (ClientRecord, error) {
	var record ClientRecord
	if err := c.store.Get(ctx, "client", realm+"/"+id, &record); err != nil {
		return record, err
	}
	if record.Deleted {
		return record, fmt.Errorf("client deleted")
	}
	return record, nil
}

func (c *Clients) Find(ctx context.Context, realm, clientID string) (ClientRecord, error) {
	clients, err := c.List(ctx, realm)
	if err != nil {
		return ClientRecord{}, err
	}
	for _, record := range clients {
		if record.ClientID() == clientID {
			return record, nil
		}
	}
	return ClientRecord{}, fmt.Errorf("client not found")
}

func (c *Clients) Save(ctx context.Context, record ClientRecord) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if !record.Deleted {
		if err := c.validateCoreRecord(ctx, record); err != nil {
			return err
		}
		if err := validateClient(record.Data); err != nil {
			return err
		}
	}
	before, err := c.readRecords(ctx)
	if err != nil {
		return err
	}
	after, same := replaceRecord(before, record)
	if same && c.RequirePublished(ctx) == nil && c.requireRecordPublished(ctx, record, before) == nil {
		return nil
	}
	if !same {
		if err := c.fenceChangedRecords(ctx, before, after); err != nil {
			return err
		}
		if err := c.store.Put(ctx, "client", recordKey(record), record); err != nil {
			return err
		}
	}
	return c.restoreLocked(ctx)
}

func (c *Clients) Delete(ctx context.Context, record ClientRecord) error {
	record.Deleted = true
	return c.Save(ctx, record)
}

func (c *Clients) Restore(ctx context.Context) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.restoreLocked(ctx)
}

// RestoreIfIdle avoids a duplicate periodic scan while a mandatory Save
// already reconciles both issuers. No grant or publication check is skipped.
func (c *Clients) RestoreIfIdle(ctx context.Context) (bool, error) {
	if !c.mu.TryLock() {
		return false, nil
	}
	defer c.mu.Unlock()
	return true, c.restoreLocked(ctx)
}

func (c *Clients) readRecords(ctx context.Context) ([]ClientRecord, error) {
	raw, err := c.store.List(ctx, "client")
	if err != nil {
		return nil, err
	}
	records := make([]ClientRecord, 0, len(raw))
	for _, item := range raw {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		var record ClientRecord
		if err := json.Unmarshal(item, &record); err != nil {
			return nil, err
		}
		if !record.Deleted {
			if err := validateClient(record.Data); err != nil {
				return nil, err
			}
		}
		records = append(records, record)
	}
	return records, nil
}

func (c *Clients) restoreLocked(ctx context.Context) error {
	records, err := c.readRecords(ctx)
	if err != nil {
		return err
	}
	active, invalid, err := c.currentCoreRecords(ctx, records)
	if err != nil {
		return err
	}
	var published bool
	if err := c.store.Get(ctx, "config", "client-publication", &published); err != nil && !isNotFound(err) {
		return err
	}
	if len(c.dex) == 0 {
		return fmt.Errorf("Dex management API unavailable")
	}
	for _, dex := range c.dex {
		if dex == nil {
			return fmt.Errorf("Dex management API unavailable")
		}
		listed, err := dex.ListClients(ctx, &api.ListClientReq{})
		if err != nil {
			return err
		}
		present := make(map[string]bool, len(listed.Clients))
		for _, client := range listed.Clients {
			present[client.Id] = true
		}
		for _, record := range active {
			if err := ctx.Err(); err != nil {
				return err
			}
			if err := c.synchronizeOne(ctx, dex, record, active, present); err != nil {
				return err
			}
		}
		if err := c.verifyFinalCatalogue(ctx, dex, active); err != nil {
			return err
		}
	}
	if err := c.publishSnapshot(ctx, records, active, invalid); err != nil {
		return err
	}

	if !published {
		return c.store.Put(ctx, "config", "client-publication", true)
	}
	return nil
}

func serviceAudiences(record ClientRecord) []string {
	var mappings []struct {
		Mapper string            `json:"protocolMapper"`
		Config map[string]string `json:"config"`
	}
	raw, _ := json.Marshal(record.Data["protocolMappers"])
	_ = json.Unmarshal(raw, &mappings)
	result := []string{}
	for _, mapping := range mappings {
		if mapping.Mapper == "oidc-audience-mapper" && mapping.Config["access.token.claim"] == "true" && mapping.Config["included.client.audience"] != "" {
			result = append(result, mapping.Config["included.client.audience"])
		}
	}
	return result
}

func (c *Clients) synchronizeOne(ctx context.Context, dex DexClients, record ClientRecord, records []ClientRecord, present map[string]bool) error {
	if dex == nil {
		return fmt.Errorf("Dex management API unavailable")
	}
	if record.Deleted && hasLiveClientSuccessor(record, records) {
		return nil
	}
	if record.Deleted || !record.Enabled() {
		if !present[record.DexID()] {
			return nil
		}
		if err := c.fenceRelatedRecords(ctx, record, records); err != nil {
			return err
		}
		_, err := dex.DeleteClient(ctx, &api.DeleteClientReq{Id: record.DexID()})
		delete(present, record.DexID())
		return err
	}
	name, _ := record.Data["name"].(string)
	desired := &api.Client{Id: record.DexID(), Secret: record.Secret(), Public: record.Public(), Name: name, RedirectUris: stringsField(record.Data, "redirectUris")}
	desired.TrustedPeers = trustedPeers(record, records)
	return c.publishClient(ctx, dex, record, records, desired, present)
}

func (c *Clients) publishClient(ctx context.Context, dex DexClients, record ClientRecord, records []ClientRecord, desired *api.Client, present map[string]bool) error {
	// Upstream GetClient returns a raw storage error for absence, which gRPC
	// exposes as Unknown. ListClients supplies an authoritative, typed absence
	// result instead of turning an arbitrary transport/storage error into create.
	if !present[desired.Id] {
		if err := c.fenceRelatedRecords(ctx, record, records); err != nil {
			return err
		}
		created, err := dex.CreateClient(ctx, &api.CreateClientReq{Client: desired})
		if err != nil {
			return err
		}
		if !created.AlreadyExists {
			present[desired.Id] = true
			return verifyClientPublication(ctx, dex, desired)
		}
	}
	existing, err := dex.GetClient(ctx, &api.GetClientReq{Id: desired.Id})
	if err != nil {
		return err
	}
	if existing == nil || existing.Client == nil {
		return fmt.Errorf("Dex client representation unavailable")
	}
	if clientNeedsReplacement(existing.Client, desired) {
		if err := c.fenceRelatedRecords(ctx, record, records); err != nil {
			return err
		}
		if _, err := dex.DeleteClient(ctx, &api.DeleteClientReq{Id: desired.Id}); err != nil {
			return err
		}
		if _, err := dex.CreateClient(ctx, &api.CreateClientReq{Client: desired}); err != nil {
			return err
		}
		return verifyClientPublication(ctx, dex, desired)
	}
	if existing.Client.Name == desired.Name && slices.Equal(existing.Client.RedirectUris, desired.RedirectUris) && slices.Equal(existing.Client.TrustedPeers, desired.TrustedPeers) {
		return nil
	}
	if err := c.fenceRelatedRecords(ctx, record, records); err != nil {
		return err
	}
	updated, err := dex.UpdateClient(ctx, &api.UpdateClientReq{Id: desired.Id, Name: desired.Name, RedirectUris: desired.RedirectUris, TrustedPeers: desired.TrustedPeers})
	if err != nil {
		return err
	}
	if updated == nil || updated.NotFound {
		return fmt.Errorf("Dex client disappeared during publication")
	}
	return verifyClientPublication(ctx, dex, desired)
}
