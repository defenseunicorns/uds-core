// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package buildinfo

import (
	"crypto/fips140"
	"fmt"
	"runtime/debug"
)

// Flavor is stamped by CI. A unicorn binary never starts with FIPS disabled.
var Flavor = "upstream"

type Info struct {
	Flavor      string
	FIPSEnabled bool
	GOFIPS140   string
}

func Current() Info {
	result := Info{Flavor: Flavor, FIPSEnabled: fips140.Enabled()}
	if build, ok := debug.ReadBuildInfo(); ok {
		for _, setting := range build.Settings {
			if setting.Key == "GOFIPS140" {
				result.GOFIPS140 = setting.Value
			}
		}
	}
	return result
}

func Check() error {
	info := Current()
	if info.Flavor != "upstream" && info.Flavor != "unicorn" {
		return fmt.Errorf("unknown controller build flavor %q", info.Flavor)
	}
	if info.Flavor == "unicorn" && (!info.FIPSEnabled || info.GOFIPS140 == "" || info.GOFIPS140 == "off") {
		return fmt.Errorf("unicorn controller requires an enabled FIPS module; GOFIPS140=%q enabled=%t", info.GOFIPS140, info.FIPSEnabled)
	}
	return nil
}
