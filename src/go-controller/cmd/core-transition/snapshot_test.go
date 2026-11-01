// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package main

import (
	"context"
	"fmt"
	"strings"
	"testing"
	"time"
)

func TestSnapshotCannotActivateAdmissionBeforeCoreNetworkingConverges(t *testing.T) {
	for _, state := range []struct {
		phase    string
		observed float64
		ready    bool
	}{{"Pending", 0, false}, {"Ready", 0, false}, {"Ready", 1, true}} {
		t.Run(fmt.Sprintf("%s/observed-%v", state.phase, state.observed), func(t *testing.T) {
			ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
			defer cancel()
			seenCore := false
			c := cluster{ctx: ctx, execute: func(_ []byte, args ...string) ([]byte, error) {
				if len(args) < 4 || args[1] != "get" {
					t.Fatal("unexpected mutation during readiness check", args)
				}
				switch args[2] {
				case "admissionparameters.policy.uds.dev":
					return encode(object{"spec": object{"valid": true, "revision": strings.Repeat("a", 64)}}), nil
				case "clusterconfig.uds.dev":
					return encode(object{"status": object{"phase": "Ready"}}), nil
				case "packages.uds.dev":
					seenCore = true
					if args[3] != "uds-controller" || !strings.Contains(strings.Join(args, " "), "--namespace uds-system") {
						t.Fatal("readiness checked an application instead of Core", args)
					}
					return encode(object{"metadata": object{"uid": "core-owner", "generation": 1}, "status": object{"phase": state.phase, "observedGeneration": state.observed}}), nil
				default:
					t.Fatal("unexpected readiness resource", args)
					return nil, nil
				}
			}}
			if err := c.snapshot(); (err == nil) != state.ready || !seenCore {
				t.Fatal("admission readiness ignored the Core Package generation", err, seenCore)
			}
		})
	}
}
