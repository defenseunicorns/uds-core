/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { PeprModule } from "pepr";

import cfg from "./package.json" with { type: "json" };

import { kubevirt } from "./src/pepr/operator/index.js";

new PeprModule(cfg, [kubevirt]);
