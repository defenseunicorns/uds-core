/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

export function getOperatorImplementation(): "pepr" | "native" {
  const implementation = process.env.UDS_CORE_OPERATOR ?? "pepr";
  if (implementation !== "pepr" && implementation !== "native") {
    throw new Error(`Unknown UDS Core operator implementation: ${implementation}`);
  }
  return implementation;
}
