// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package buildinfo

import "testing"

func TestUnicornRequiresRuntimeFIPS(t *testing.T) {
	original := Flavor
	t.Cleanup(func() { Flavor = original })
	Flavor = "upstream"
	if err := Check(); err != nil {
		t.Fatal(err)
	}
	Flavor = "unknown"
	if err := Check(); err == nil {
		t.Fatal("accepted unknown flavor")
	}
	Flavor = "unicorn"
	info := Current()
	expected := info.FIPSEnabled && info.GOFIPS140 != "" && info.GOFIPS140 != "off"
	if (Check() == nil) != expected {
		t.Fatal("unicorn guard ignored actual runtime crypto mode")
	}
}
