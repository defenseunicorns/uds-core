import { defineConfig, devices } from "@playwright/test";

export const playwrightDir = ".playwright";
export const authFile = `${playwrightDir}/auth/user.json`;

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  fullyParallel: true,
  forbidOnly: !!process.env.CI, // fail CI if you accidentally leave `test.only` in source
  retries: process.env.CI ? 1 : 0,
  workers: 5,
  reporter: [
    // Reporter to use. See https://playwright.dev/docs/test-reporters
    ['html', { outputFolder: `${playwrightDir}/reports`, open: 'never' }],
    ['json', { outputFile: `${playwrightDir}/reports/test-results.json`, open: 'never' }],
    ['list']
  ],

  outputDir: `${playwrightDir}/output`,

  use: {
    trace: 'on-first-retry', // collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer
  },

  projects: [
    { name: 'setup', testMatch: /.*\.setup\.ts/ }, // authentication

    ...[
      'Desktop Chrome',
    ].map((p) => ({
      name: devices[p].defaultBrowserType,
      dependencies: ['setup'],
      use: {
        ...devices[p],
        storageState: authFile,
      },
    })),
  ],
});
