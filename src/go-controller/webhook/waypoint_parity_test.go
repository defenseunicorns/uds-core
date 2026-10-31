// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package webhook

import (
	"encoding/json"
	"os"
	"reflect"
	"testing"

	"github.com/defenseunicorns/uds-core/src/go-controller/internal/store"
	admissionv1 "k8s.io/api/admission/v1"
)

func TestPinnedCoreWaypointMutationParity(t *testing.T) {
	raw, err := os.ReadFile("testdata/core-waypoint-parity.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixture struct {
		SourceRevision string
		Cases          []struct {
			Kind             string
			Object, Expected map[string]interface{}
		}
	}
	if err := json.Unmarshal(raw, &fixture); err != nil {
		t.Fatal(err)
	}
	if fixture.SourceRevision != "c15677633cffa17e99656a7d7ccd1f98d7cb6e4d" || len(fixture.Cases) != 10 {
		t.Fatal("pinned source topology fixture is incomplete")
	}
	ws := store.NewWaypointStore()
	ws.Set("apps", []store.WaypointEntry{{Selector: map[string]string{"app": "demo"}, WaypointName: "demo-waypoint"}})
	for _, test := range fixture.Cases {
		for _, operation := range []admissionv1.Operation{admissionv1.Create, admissionv1.Update} {
			handler := MutatePodWaypoint(ws)
			if test.Kind == "Service" {
				handler = MutateServiceWaypoint(ws)
			}
			_, admitted := topologyAdmission(t, handler, test.Kind, operation, test.Object)
			if !reflect.DeepEqual(admitted, test.Expected) {
				t.Fatalf("%s %s differs from pinned Core: got %#v source %#v", test.Kind, operation, admitted, test.Expected)
			}
		}
	}
}
