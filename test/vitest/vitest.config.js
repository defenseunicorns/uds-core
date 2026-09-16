/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { defineConfig } from 'vitest/config';

const skipFleetAdmin = process.env.SKIP_FLEET_ADMIN === 'true';

export default defineConfig({
  test: {
    globalSetup: ['./vitest.setup.js'],
    teardownTimeout: 30000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['**/node_modules/**'],
    },
    projects: [
      {
        extends: false,
        test: {
          name: 'network',
          globals: true,
          environment: 'node',
          include: ['network.spec.ts', 'pepr-policies/network.spec.ts'],
          exclude: ['trust-bundle/**'],
          sequence: { groupOrder: 0 },
        },
      },
      {
        extends: false,
        test: {
          name: 'remaining',
          globals: true,
          environment: 'node',
          include: ['**/*.spec.ts'],
          exclude: [
            'trust-bundle/**',
            '**/network.spec.ts',
            ...(skipFleetAdmin ? ['**/keycloak-fleet-admin.spec.ts'] : []),
          ],
          sequence: { groupOrder: 1 },
        },
      },
    ],
  },
});
