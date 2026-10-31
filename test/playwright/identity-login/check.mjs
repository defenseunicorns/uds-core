// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const output = process.argv[2];
assert(output && path.isAbsolute(output), "Pass an absolute screenshot/evidence directory");
await mkdir(output, { recursive: true });
const scratch = await mkdtemp(path.join(tmpdir(), "uds-identity-browser-"));
let fixture;
let browser;
const consoleErrors = [];
const failedRequests = [];
const checks = [];

async function buildFixture() {
  const child = spawn(
    "go",
    [
      "build",
      "-p",
      "2",
      "-o",
      path.join(scratch, "login-server"),
      "./internal/devidentity/testdata/login-server.go",
    ],
    {
      cwd: path.join(root, "src/dev-identity"),
      env: { ...process.env, GOWORK: "off", GOTOOLCHAIN: "local" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let log = "";
  child.stdout.on("data", data => (log += data));
  child.stderr.on("data", data => (log += data));
  const [code] = await once(child, "exit");
  await writeFile(path.join(output, "fixture-build.log"), log);
  assert.equal(code, 0, "Browser fixture did not compile; see fixture-build.log");
}

function contrast(foreground, background) {
  const luminance = value => {
    const rgb = value
      .match(/\d+/g)
      .slice(0, 3)
      .map(Number)
      .map(v => {
        v /= 255;
        return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      });
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  };
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

try {
  await buildFixture();
  fixture = spawn(path.join(scratch, "login-server"), [], { stdio: ["ignore", "pipe", "pipe"] });
  let fixtureLog = "";
  fixture.stderr.on("data", data => (fixtureLog += data));
  const lines = createInterface({ input: fixture.stdout });
  const ready = await Promise.race([
    once(lines, "line").then(([line]) => JSON.parse(line)),
    once(fixture, "exit").then(() => {
      throw new Error("Browser fixture exited before readiness");
    }),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Browser fixture readiness timed out")), 15000).unref(),
    ),
  ]);
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    javaScriptEnabled: false,
    viewport: { width: 1366, height: 900 },
  });
  const page = await context.newPage();
  page.on("console", message => {
    if (message.type() === "error" && !message.text().includes("401 (Unauthorized)"))
      consoleErrors.push(message.text());
  });
  page.on("requestfailed", request => failedRequests.push(request.url()));
  const response = await page.goto(ready.url);
  assert.equal(response.status(), 200);
  assert.equal(await page.title(), "UDS sign in");
  const csp = response.headers()["content-security-policy"];
  assert(csp.includes("style-src 'self'") && csp.includes("default-src 'none'"));
  assert(!csp.includes("unsafe-inline") && !csp.includes("unsafe-eval"));
  const username = page.getByLabel("Username or email", { exact: true });
  const password = page.getByLabel("Password", { exact: true });
  const submit = page.getByRole("button", { name: "Sign In", exact: true });
  await username.waitFor({ state: "visible" });
  assert.equal(
    await page.locator(".auth-card").evaluate(el => getComputedStyle(el).backgroundColor),
    "rgb(17, 24, 39)",
    "Bundled CSS was not applied",
  );
  for (const selector of ["h1", "label", ".description", ".footer", ".button"]) {
    const colors = await page
      .locator(selector)
      .first()
      .evaluate(el => {
        const style = getComputedStyle(el);
        const parent = el.closest(".auth-card") || document.documentElement;
        return [
          style.color,
          style.backgroundColor === "rgba(0, 0, 0, 0)"
            ? getComputedStyle(parent).backgroundColor
            : style.backgroundColor,
        ];
      });
    assert(contrast(...colors) >= 4.5, `${selector} text contrast is below 4.5:1`);
  }
  await page.screenshot({ path: path.join(output, "login-desktop.png"), fullPage: true });
  await page.keyboard.press("Tab");
  assert(await username.evaluate(el => el === document.activeElement));
  await page.keyboard.press("Tab");
  assert(await password.evaluate(el => el === document.activeElement));
  await page.keyboard.press("Tab");
  assert(await submit.evaluate(el => el === document.activeElement));
  assert.equal(await submit.evaluate(el => getComputedStyle(el).outlineWidth), "3px");
  checks.push("CSP, same-origin bundled CSS, accessible labels, text contrast, and keyboard focus");
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `Horizontal overflow at ${width}px`,
    );
    await page.screenshot({ path: path.join(output, `login-${width}.png`), fullPage: true });
  }
  checks.push("390px and 320px mobile layout without horizontal overflow");
  await page.setViewportSize({ width: 1366, height: 900 });
  const csrfBefore = await page.locator('input[name="csrf"]').inputValue();
  await username.fill("doug");
  await password.fill("wrong-password");
  const denied = page.waitForResponse(
    r => r.url() === ready.url + "/login" && r.request().method() === "POST",
  );
  await submit.click();
  assert.equal((await denied).status(), 401);
  await page.getByRole("alert").waitFor({ state: "visible" });
  assert.equal(await username.inputValue(), "doug");
  assert.equal(await password.inputValue(), "");
  assert.notEqual(await page.locator('input[name="csrf"]').inputValue(), csrfBefore);
  assert(!(await context.cookies()).some(cookie => cookie.name === "KEYCLOAK_SESSION"));
  await page.screenshot({ path: path.join(output, "login-error.png"), fullPage: true });
  checks.push(
    "Invalid credentials render an inline 401 error, clear the password, rotate CSRF, and issue no session",
  );
  await password.fill("test-password");
  await submit.click();
  await page.getByRole("heading", { name: "UDS account", exact: true }).waitFor();
  assert.equal(await page.title(), "UDS account");
  const session = (await context.cookies()).find(cookie => cookie.name === "KEYCLOAK_SESSION");
  assert(session && session.secure && session.httpOnly && session.sameSite === "Lax");
  await page.screenshot({ path: path.join(output, "login-authenticated.png"), fullPage: true });
  await page.getByRole("link", { name: "Sign out", exact: true }).click();
  await page.getByRole("heading", { name: "Signed out", exact: true }).waitFor();
  assert(!(await context.cookies()).some(cookie => cookie.name === "KEYCLOAK_SESSION"));
  assert.equal(await page.title(), "UDS sign out");
  checks.push("HTML-only successful sign-in, secure session, and logout");
  await page.goto(ready.url + "/realms/uds/callback/proof?state=unchanged");
  await username.fill("doug");
  await password.fill("test-password");
  await submit.click();
  await page.getByRole("heading", { name: "Application callback", exact: true }).waitFor();
  assert.equal(page.url(), ready.callback);
  checks.push(
    "Post-login document navigation reaches the cross-host callback with original state and no identity cookie",
  );
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(failedRequests, []);
  await writeFile(
    path.join(output, "report.json"),
    JSON.stringify(
      { passed: checks, javaScriptEnabled: false, consoleErrors, failedRequests },
      null,
      2,
    ) + "\n",
  );
  await writeFile(path.join(output, "fixture.log"), fixtureLog);
  console.log(JSON.stringify({ passed: checks.length, output }));
} finally {
  if (browser) await browser.close();
  if (fixture && fixture.exitCode === null) {
    const stopped = once(fixture, "exit");
    fixture.kill("SIGTERM");
    await stopped;
  }
  await rm(scratch, { recursive: true, force: true });
}
