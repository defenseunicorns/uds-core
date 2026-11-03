// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package udspackage

import (
	"k8s.io/apimachinery/pkg/types"
	"sync"
)

// Recovery epochs distinguish events observed during reconciliation from the
// events it has already handled. Completing a run cannot clear a later event.
type recoveryEntry struct {
	events, completed uint64
	seen              bool
}
type recoveryState struct {
	mu      sync.Mutex
	entries map[types.UID]recoveryEntry
}

func newRecoveryState() *recoveryState {
	return &recoveryState{entries: make(map[types.UID]recoveryEntry)}
}

func (s *recoveryState) invalidate(uid types.UID) {
	s.mu.Lock()
	defer s.mu.Unlock()
	entry := s.entries[uid]
	entry.events++
	s.entries[uid] = entry
}

func (s *recoveryState) capture(uid types.UID) uint64 {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.entries[uid].events
}

func (s *recoveryState) complete(uid types.UID, epoch uint64) {
	s.mu.Lock()
	defer s.mu.Unlock()
	entry := s.entries[uid]
	if epoch > entry.completed {
		entry.completed = epoch
	}
	entry.seen = true
	s.entries[uid] = entry
}

func (s *recoveryState) dirty(uid types.UID) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	entry := s.entries[uid]
	return !entry.seen || entry.completed < entry.events
}

func (s *recoveryState) remove(uid types.UID) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.entries, uid)
}
