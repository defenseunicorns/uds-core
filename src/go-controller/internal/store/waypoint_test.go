// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package store

import "testing"

func TestMultiplePackagesDoNotOverwriteOrDeleteEachOthersWaypoints(t *testing.T) {
	store := NewWaypointStore()
	store.SetForPackage("app", "one", []WaypointEntry{{Selector: map[string]string{"app": "one"}, WaypointName: "one-waypoint"}})
	store.SetForPackage("app", "two", []WaypointEntry{{Selector: map[string]string{"app": "two"}, WaypointName: "two-waypoint"}})
	if len(store.Get("app")) != 2 {
		t.Fatal("second Package replaced the first Package's routing")
	}
	store.DeleteForPackage("app", "one")
	remaining := store.Get("app")
	if len(remaining) != 1 || remaining[0].WaypointName != "two-waypoint" {
		t.Fatal("deletion removed another Package's routing")
	}
	remaining[0].Selector["app"] = "changed"
	if store.Get("app")[0].Selector["app"] != "two" {
		t.Fatal("caller changed shared routing state")
	}
}

func TestWaypointConvergenceReadPreservesPackageUIDAndDeepCopies(t *testing.T) {
	store := NewWaypointStore()
	store.SetForPackage("app", "old-uid", []WaypointEntry{{Selector: map[string]string{"app": "same"}, WaypointName: "old-waypoint"}})
	store.SetForPackage("app", "current-uid", []WaypointEntry{{Selector: map[string]string{"app": "same"}, WaypointName: "current-waypoint"}})
	current := store.GetForPackage("app", "current-uid")
	if len(current) != 1 || current[0].WaypointName != "current-waypoint" {
		t.Fatal("overlapping selector inherited another Package's authority")
	}
	current[0].Selector["app"] = "changed"
	current[0].WaypointName = "changed"
	if got := store.GetForPackage("app", "current-uid"); got[0].Selector["app"] != "same" || got[0].WaypointName != "current-waypoint" {
		t.Fatal("caller changed UID-scoped convergence state")
	}
	if len(store.GetForPackage("app", "recreated-uid")) != 0 || len(store.GetForPackage("other", "current-uid")) != 0 {
		t.Fatal("unobserved UID/namespace inherited routing authority")
	}
}
