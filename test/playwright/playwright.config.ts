/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { defineConfig, devices } from "@playwright/test";

export const playwrightDir = ".playwright";
export const authFile = `${playwrightDir}/auth/user.json`;

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  fullyParallel: true,
  forbidOnly: !!process.env.CI, // fail CI if you accidentally leave `test.only` in source
  retries: 1,
  workers: 20, // Support up to 20 parallel workers
  timeout: 45000, // 45 second timeout for tests
  reporter: [
    // Reporter to use. See https://playwright.dev/docs/test-reporters
    ["html", { outputFolder: `${playwrightDir}/reports`, open: "never" }],
  ],

  outputDir: `${playwrightDir}/output`,

  // ignore running private pki tests from top level to avoid failures
  testIgnore: ["**/private-pki/**"],

  use: {
    trace: "retain-on-failure", // save trace for failed tests. See https://playwright.dev/docs/trace-viewer#opening-the-trace
  },

  projects: [
    { name: "setup", testMatch: /.*\.setup\.ts/ }, // authentication

    ...["Desktop Chrome"].map(p => ({
      name: devices[p].defaultBrowserType,
      dependencies: ["setup"],
      use: {
        ...devices[p],
        storageState: authFile,
      },
    })),
  ],
});
