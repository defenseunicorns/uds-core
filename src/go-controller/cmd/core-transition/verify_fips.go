// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package main

import (
	"encoding/json"
	"fmt"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/buildinfo"
)

func (c cluster) verifyFIPS() error {
	pods, err := c.list("pods", "uds-system")
	if err != nil {
		return err
	}
	checked := 0
	for _, pod := range pods {
		if str(pod, "metadata", "labels", "app") != "uds-controller" {
			continue
		}
		if get(pod, "metadata", "deletionTimestamp") != nil {
			continue
		}
		if str(pod, "status", "phase") != "Running" {
			return fmt.Errorf("controller pod %s is not running for FIPS verification", str(pod, "metadata", "name"))
		}
		raw, err := c.podBuildInfo(str(pod, "metadata", "name"))
		if err != nil {
			return fmt.Errorf("controller FIPS self-check: %w", err)
		}
		var info buildinfo.Info
		if err := json.Unmarshal(raw, &info); err != nil {
			return err
		}
		if info.Flavor != "unicorn" || !info.FIPSEnabled || info.GOFIPS140 == "" || info.GOFIPS140 == "off" {
			return fmt.Errorf("controller lacks required unicorn FIPS mode: %+v", info)
		}
		checked++
	}
	if checked == 0 {
		return fmt.Errorf("no running controller replicas for FIPS verification")
	}
	return nil
}
