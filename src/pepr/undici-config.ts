/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { Agent, setGlobalDispatcher } from "undici";
import { Component, setupLogger } from "./logger";

const log = setupLogger(Component.STARTUP);

let configured = false;

/**
 * Configure undici's global dispatcher with tight timeouts so K8s API calls
 * fail fast when the underlying socket dies silently (apiserver pod rolled,
 * konnectivity tunnel dropped, HCP churn). Without these, a fetch can hang
 * for minutes on a dead TCP connection before throwing, eating retry budgets.
 *
 * Values overridable via env vars for tuning.
 */
export function configureUndici(): void {
  if (configured) return;
  configured = true;

  const connectTimeoutMs = parseInt(process.env.PEPR_UNDICI_CONNECT_TIMEOUT_MS ?? "10000", 10);
  const headersTimeoutMs = parseInt(process.env.PEPR_UNDICI_HEADERS_TIMEOUT_MS ?? "15000", 10);
  const bodyTimeoutMs = parseInt(process.env.PEPR_UNDICI_BODY_TIMEOUT_MS ?? "30000", 10);
  const keepAliveTimeoutMs = parseInt(process.env.PEPR_UNDICI_KEEP_ALIVE_TIMEOUT_MS ?? "10000", 10);

  try {
    setGlobalDispatcher(
      new Agent({
        connect: { timeout: connectTimeoutMs },
        headersTimeout: headersTimeoutMs,
        bodyTimeout: bodyTimeoutMs,
        keepAliveTimeout: keepAliveTimeoutMs,
      }),
    );
    log.info(
      { connectTimeoutMs, headersTimeoutMs, bodyTimeoutMs, keepAliveTimeoutMs },
      "Configured undici global dispatcher",
    );
  } catch (err) {
    log.warn({ err }, "Failed to configure undici global dispatcher");
  }
}
