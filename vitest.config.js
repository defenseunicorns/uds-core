/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { defineConfig } from 'vitest/config';

const isCi = process.env.CI_COVERAGE_ALL === 'true';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    globalSetup: ['./vitest.setup.js'],
    include: ['**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      all: isCi,
      include: ['src/pepr/**'],
      exclude: ['**/docs-gen/**', '**/crd/generated/**', '**/crd/sources/**'],
    },
  },
});
