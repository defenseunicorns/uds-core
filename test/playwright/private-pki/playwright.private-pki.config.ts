/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { defineConfig, devices } from "@playwright/test";
import path from "path";
import { playwrightDir } from "../playwright.config";

// Set the environment variable for Firefox policies
const policiesJsonPath = path.join(__dirname, "firefox-policies.json");
process.env.PLAYWRIGHT_FIREFOX_POLICIES_JSON = policiesJsonPath;

export default defineConfig({
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 1,
  workers: 1,
  timeout: 45000,
  reporter: [["html", { outputFolder: `${playwrightDir}/reports/private-pki`, open: "never" }]],

  outputDir: `${playwrightDir}/output/private-pki`,

  use: {
    trace: "retain-on-failure",
    baseURL: `https://grafana.admin.uds.dev`,
  },

  projects: [
    {
      name: "firefox",
      use: {
        ...devices["Desktop Firefox"],
      },
    },
  ],
});
