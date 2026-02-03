/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { Monitor } from "../../crd/index.js";
import { sanitizeResourceName } from "../utils.js";

export function generateMonitorName(pkgName: string, monitor: Monitor) {
  const { selector, portName, description } = monitor;

  // Ensure the resource name is valid
  const nameSuffix = description || `${Object.values(selector)}-${portName}`;
  const name = sanitizeResourceName(`${pkgName}-${nameSuffix}`);

  return name;
}
