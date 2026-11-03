// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package utils

import "strings"

func WaypointName(clientID string) string {
	name := SanitizeResourceName(clientID)
	if strings.HasSuffix(name, "-waypoint") {
		return name
	}
	return name + "-waypoint"
}
