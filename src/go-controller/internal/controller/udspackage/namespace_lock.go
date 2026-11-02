// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package udspackage

import (
	"context"
	"sync"
)

type namespaceLock struct {
	token chan struct{}
	users int
}
type namespaceLocks struct {
	mu      sync.Mutex
	entries map[string]*namespaceLock
}

func (l *namespaceLocks) acquire(ctx context.Context, namespace string) (func(), error) {
	l.mu.Lock()
	if l.entries == nil {
		l.entries = map[string]*namespaceLock{}
	}
	entry := l.entries[namespace]
	if entry == nil {
		entry = &namespaceLock{token: make(chan struct{}, 1)}
		entry.token <- struct{}{}
		l.entries[namespace] = entry
	}
	entry.users++
	l.mu.Unlock()
	releaseRef := func() {
		l.mu.Lock()
		defer l.mu.Unlock()
		entry.users--
		if entry.users == 0 {
			delete(l.entries, namespace)
		}
	}
	select {
	case <-ctx.Done():
		releaseRef()
		return nil, ctx.Err()
	case <-entry.token:
	}
	return func() { entry.token <- struct{}{}; releaseRef() }, nil
}
