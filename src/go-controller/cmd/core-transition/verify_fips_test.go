// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package main

import (
	"encoding/json"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/buildinfo"
	"testing"
)

func TestVerifyFIPSChecksEveryReplica(t *testing.T) {
	for _, bad := range []bool{false, true} {
		checked := 0
		c := cluster{execPod: func(name string) ([]byte, error) {
			checked++
			info := buildinfo.Info{Flavor: "unicorn", FIPSEnabled: true, GOFIPS140: "v1.0.0-c2097c7c"}
			if bad && checked == 2 {
				info.FIPSEnabled = false
			}
			return json.Marshal(info)
		}, execute: func(_ []byte, args ...string) ([]byte, error) {
			pods := []object{}
			for _, name := range []string{"one", "two"} {
				pods = append(pods, object{"metadata": object{"name": name, "labels": object{"app": "uds-controller"}}, "status": object{"phase": "Running"}})
			}
			return json.Marshal(object{"items": pods})
		}}
		err := c.verifyFIPS()
		if checked != 2 || (err != nil) != bad {
			t.Fatalf("replicas=%d bad=%t error=%v", checked, bad, err)
		}
	}
}
