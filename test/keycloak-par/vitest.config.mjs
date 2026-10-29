/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  test: {
    globals: true,
    environment: "node",
    include: ["keycloak-par.integration.test.ts"],
    testTimeout: 300_000,
    hookTimeout: 300_000,
    maxWorkers: 1,
  },
});
