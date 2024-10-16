/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { Capability } from "pepr";

export const patches = new Capability({
  name: "patches",
  description: "UDS Core Capability for patching miscellaneous things.",
});
