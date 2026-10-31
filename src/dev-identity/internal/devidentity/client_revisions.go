// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package devidentity

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"slices"
	"sort"
)

type clientPublication struct {
	Digest string `json:"digest"`
}

func recordKey(record ClientRecord) string { return record.Realm + "/" + record.ID() }

func trustedPeers(record ClientRecord, records []ClientRecord) []string {
	peers := []string{}
	for _, peer := range records {
		if peer.Realm == record.Realm && !peer.Deleted && peer.Enabled() && !peer.Public() && peer.Data["serviceAccountsEnabled"] == true && slices.Contains(serviceAudiences(peer), record.ClientID()) {
			peers = append(peers, peer.DexID())
		}
	}
	for _, peer := range records {
		if peer.Realm == record.Realm && !peer.Deleted && peer.Enabled() && peer.Public() && clientAttributes(peer)["pkce.code.challenge.method"] == "S256" && sameCoreOwner(peer.CoreOwner, record.CoreOwner) && slices.Contains(publicAudienceTargets(peer.Data), record.ClientID()) {
			peers = append(peers, peer.DexID())
		}
	}
	sort.Strings(peers)
	return slices.Compact(peers)
}

func publicationDigest(record ClientRecord, records []ClientRecord) (string, error) {
	type targetRevision struct {
		Record       ClientRecord
		TrustedPeers []string
	}
	targets := []targetRevision{}
	for _, target := range records {
		if target.Realm == record.Realm && !target.Deleted && slices.Contains(publicationAudiences(record), target.ClientID()) {
			targets = append(targets, targetRevision{target, trustedPeers(target, records)})
		}
	}
	sort.Slice(targets, func(i, j int) bool { return recordKey(targets[i].Record) < recordKey(targets[j].Record) })
	raw, err := json.Marshal(struct {
		Record          ClientRecord
		TrustedPeers    []string
		AudienceTargets []targetRevision
	}{record, trustedPeers(record, records), targets})
	if err != nil {
		return "", err
	}
	digest := sha256.Sum256(raw)
	return hex.EncodeToString(digest[:]), nil
}

func replaceRecord(records []ClientRecord, wanted ClientRecord) ([]ClientRecord, bool) {
	next := append([]ClientRecord(nil), records...)
	for index, old := range next {
		if recordKey(old) == recordKey(wanted) {
			before, _ := json.Marshal(old)
			after, _ := json.Marshal(wanted)
			next[index] = wanted
			return next, bytes.Equal(before, after)
		}
	}
	return append(next, wanted), false
}

func (c *Clients) requireRecordPublished(ctx context.Context, record ClientRecord, records []ClientRecord) error {
	expected, err := publicationDigest(record, records)
	if err != nil {
		return err
	}
	var entry clientPublication
	if err := c.store.Get(ctx, "publication", recordKey(record), &entry); err != nil {
		return err
	}
	if entry.Digest != expected {
		return fmt.Errorf("client publication incomplete")
	}
	return nil
}

func (c *Clients) publishRecord(ctx context.Context, record ClientRecord, records []ClientRecord) error {
	if c.requireRecordPublished(ctx, record, records) == nil {
		return nil
	}
	digest, err := publicationDigest(record, records)
	if err != nil {
		return err
	}
	return c.store.Put(ctx, "publication", recordKey(record), clientPublication{Digest: digest})
}

// A pinned desired snapshot and its publication digest bind token authority
// to the exact client revision and derived trusted peers, not catalogue writes.
func (c *Clients) PublishedClient(ctx context.Context, realm, logicalID string) (ClientRecord, []ClientRecord, error) {
	if err := c.RequirePublished(ctx); err != nil {
		return ClientRecord{}, nil, err
	}
	records, err := c.readRecords(ctx)
	if err != nil {
		return ClientRecord{}, nil, err
	}
	for _, record := range records {
		if record.Realm == realm && record.ClientID() == logicalID && !record.Deleted {
			if err := c.validateCoreRecord(ctx, record); err != nil {
				return ClientRecord{}, nil, err
			}
			return record, records, c.requireRecordPublished(ctx, record, records)
		}
	}
	return ClientRecord{}, nil, fmt.Errorf("client unavailable")
}

func (c *Clients) fenceChangedRecords(ctx context.Context, before, after []ClientRecord) error {
	for _, record := range after {
		oldDigest := ""
		var previous *ClientRecord
		for _, old := range before {
			if recordKey(old) == recordKey(record) {
				oldDigest, _ = publicationDigest(old, before)
				previous = &old
				break
			}
		}
		nextDigest, err := publicationDigest(record, after)
		if err != nil {
			return err
		}
		if oldDigest != nextDigest {
			if previous != nil {
				if err := c.fenceRelatedRecords(ctx, *previous, before); err != nil {
					return err
				}
			}
			if err := c.fenceRelatedRecords(ctx, record, append(append([]ClientRecord(nil), before...), after...)); err != nil {
				return err
			}
		}
	}
	return nil
}

func (c *Clients) fenceRelatedRecords(ctx context.Context, changed ClientRecord, records []ClientRecord) error {
	seen := map[string]bool{}
	for _, record := range append([]ClientRecord{changed}, records...) {
		related := recordKey(record) == recordKey(changed) || record.Realm == changed.Realm && (slices.Contains(publicationAudiences(record), changed.ClientID()) || slices.Contains(publicationAudiences(changed), record.ClientID()))
		key := recordKey(record)
		if !related || seen[key] {
			continue
		}
		seen[key] = true
		var previous clientPublication
		if err := c.store.Get(ctx, "publication", key, &previous); err == nil && previous.Digest == "" {
			continue
		} else if err != nil && !isNotFound(err) {
			return err
		}
		if err := c.store.Put(ctx, "publication", key, clientPublication{}); err != nil {
			return err
		}
	}
	return nil
}

func publicationAudiences(record ClientRecord) []string {
	return slices.Compact(append(serviceAudiences(record), publicAudienceTargets(record.Data)...))
}
