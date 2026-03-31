// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package store

import "sync"

// WaypointEntry maps an authservice selector to the waypoint name it should route through.
type WaypointEntry struct {
	Selector     map[string]string // enableAuthserviceSelector from SSO spec
	WaypointName string            // sanitized clientID + "-waypoint"
}

// WaypointStore holds per-namespace waypoint entries populated by the package controller.
// It is safe for concurrent use.
type WaypointStore struct {
	mu      sync.RWMutex
	entries map[string][]WaypointEntry // namespace → entries
}

// NewWaypointStore creates an empty WaypointStore.
func NewWaypointStore() *WaypointStore {
	return &WaypointStore{entries: make(map[string][]WaypointEntry)}
}

// Set replaces all waypoint entries for the given namespace.
func (s *WaypointStore) Set(namespace string, entries []WaypointEntry) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.entries[namespace] = entries
}

// Get returns the waypoint entries for the given namespace (nil if none).
func (s *WaypointStore) Get(namespace string) []WaypointEntry {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.entries[namespace]
}

// Delete removes all waypoint entries for the given namespace.
func (s *WaypointStore) Delete(namespace string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.entries, namespace)
}
