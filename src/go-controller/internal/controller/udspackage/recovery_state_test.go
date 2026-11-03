// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package udspackage

import (
	"k8s.io/apimachinery/pkg/types"
	"sync"
	"testing"
)

func TestRecoveryRetainsEventDuringReconciliation(t *testing.T) {
	state := newRecoveryState()
	uid := types.UID("original")
	state.invalidate(uid)
	epoch := state.capture(uid)
	state.invalidate(uid)
	state.complete(uid, epoch)
	if !state.dirty(uid) {
		t.Fatal("lost event received while reconciliation was running")
	}
	state.complete(uid, state.capture(uid))
	if state.dirty(uid) {
		t.Fatal("completed current epoch stayed dirty")
	}
}

func TestRecoveryDoesNotCarryStateAcrossRecreation(t *testing.T) {
	state := newRecoveryState()
	uid := types.UID("old")
	state.complete(uid, state.capture(uid))
	state.remove(uid)
	if !state.dirty(types.UID("new")) {
		t.Fatal("new object inherited old completion")
	}
	if len(state.entries) != 0 {
		t.Fatal("deleted object retained completion state")
	}
}

func TestRecoveryConcurrentKeys(t *testing.T) {
	state := newRecoveryState()
	var workers sync.WaitGroup
	for i := 0; i < 8; i++ {
		workers.Go(func() {
			for n := 0; n < 100; n++ {
				state.invalidate(types.UID("same"))
				state.complete(types.UID("same"), state.capture(types.UID("same")))
			}
		})
	}
	workers.Wait()
	if state.capture(types.UID("same")) != 800 {
		t.Fatal("concurrent events were lost")
	}
}
