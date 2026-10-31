// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package udspackage

import (
	"testing"

	udstypes "github.com/defenseunicorns/uds-core/src/go-controller/api/uds/v1alpha1"
	"k8s.io/apimachinery/pkg/types"
)

func TestSharedDependenciesTargetCurrentUIDsAndDurableClientOwners(t *testing.T) {
	ctrl, _, indexer := resyncFixture(t, 3)
	current := readyPackage("stable-00")
	current.Spec.Sso = []udstypes.Sso{{ClientID: "desired"}}
	historical := readyPackage("stable-01")
	historical.Status.AuthserviceClients = []udstypes.AuthserviceClient{{ClientID: "historical"}}
	for _, pkg := range []*udstypes.UDSPackage{current, historical} {
		if err := indexer.Update(pkg); err != nil {
			t.Fatal(err)
		}
	}
	ctrl.RequeueSSOClients([]string{"desired", "historical"})
	if ctrl.queue.Len() != 2 || !ctrl.recovery.dirty(current.UID) || !ctrl.recovery.dirty(historical.UID) || ctrl.recovery.dirty("stable-02") {
		t.Fatal("shared chains did not retain exact current/historical owner scope")
	}
	drainPackages(ctrl)
	ctrl.RequeueUIDs([]types.UID{"stale-package-uid"})
	if ctrl.queue.Len() != 0 {
		t.Fatal("stale module UID gained replacement Package authority")
	}
	ctrl.RequeueUIDs([]types.UID{"stable-02"})
	if ctrl.queue.Len() != 1 || !ctrl.recovery.dirty("stable-02") {
		t.Fatal("live module owner recovery was skipped")
	}
}
