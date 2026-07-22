/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { Capability } from "pepr";

export const kubevirt = new Capability({
  name: "uds-vm-kubevirt",
  description: "UDS VM KubeVirt enablement: namespace labeling, VM mutation, secret propagation",
});

export const { Store, When } = kubevirt;
