// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package store

import (
	"maps"
	"sort"
	"sync"
)

type WaypointEntry struct {
	Selector     map[string]string
	WaypointName string
}
type WaypointStore struct {
	mu      sync.RWMutex
	entries map[string]map[string][]WaypointEntry
}

func NewWaypointStore() *WaypointStore {
	return &WaypointStore{entries: map[string]map[string][]WaypointEntry{}}
}
func copyEntries(entries []WaypointEntry) []WaypointEntry {
	copy := append([]WaypointEntry(nil), entries...)
	for index := range copy {
		copy[index].Selector = maps.Clone(copy[index].Selector)
	}
	return copy
}

// Set preserves the original single-owner API for standalone webhook fixtures.
func (s *WaypointStore) Set(namespace string, entries []WaypointEntry) {
	s.SetForPackage(namespace, "legacy", entries)
}
func (s *WaypointStore) SetForPackage(namespace, owner string, entries []WaypointEntry) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.entries[namespace] == nil {
		s.entries[namespace] = map[string][]WaypointEntry{}
	}
	s.entries[namespace][owner] = copyEntries(entries)
}
func (s *WaypointStore) Get(namespace string) []WaypointEntry {
	s.mu.RLock()
	defer s.mu.RUnlock()
	owners := make([]string, 0, len(s.entries[namespace]))
	for owner := range s.entries[namespace] {
		owners = append(owners, owner)
	}
	sort.Strings(owners)
	result := []WaypointEntry{}
	for _, owner := range owners {
		result = append(result, copyEntries(s.entries[namespace][owner])...)
	}
	return result
}

// GetForPackage retains the UID provenance needed by admission convergence
// checks. A matching route from another Package is not this owner's authority.
func (s *WaypointStore) GetForPackage(namespace, owner string) []WaypointEntry {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return copyEntries(s.entries[namespace][owner])
}

func (s *WaypointStore) Delete(namespace string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.entries, namespace)
}
func (s *WaypointStore) DeleteForPackage(namespace, owner string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.entries[namespace], owner)
	if len(s.entries[namespace]) == 0 {
		delete(s.entries, namespace)
	}
}
