/**
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

const DEFAULT_HTTP_TIMEOUT_MS = 15000;

/**
 * Fetch with a bounded request lifetime so a stalled connection cannot hold a
 * Vitest worker open indefinitely. The caller's AbortSignal is preserved.
 */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = DEFAULT_HTTP_TIMEOUT_MS,
): Promise<Response> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error(`HTTP request timeout must be greater than zero: ${timeoutMs}`);
  }

  const request = input instanceof Request ? input : undefined;
  const requestUrl = request?.url ?? input.toString();
  const requestMethod = init.method ?? request?.method ?? "GET";
  const requestDescription = `${requestMethod} ${requestUrl}`;
  const callerSignal = init.signal ?? request?.signal;
  const controller = new AbortController();
  let timedOut = false;

  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort(new Error(`request timed out after ${timeoutMs}ms`));
  }, timeoutMs);

  const abortFromCaller = () => {
    controller.abort(callerSignal?.reason);
  };

  if (callerSignal?.aborted) {
    abortFromCaller();
  } else {
    callerSignal?.addEventListener("abort", abortFromCaller, { once: true });
  }

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error: unknown) {
    const cause = error instanceof Error ? error : new Error(String(error));
    if (timedOut) {
      throw new Error(`${requestDescription} timed out after ${timeoutMs}ms`, { cause });
    }

    if (callerSignal?.aborted) {
      throw new Error(`${requestDescription} was aborted`, { cause });
    }

    throw new Error(`${requestDescription} failed: ${cause.message}`, { cause });
  } finally {
    clearTimeout(timeout);
    callerSignal?.removeEventListener("abort", abortFromCaller);
  }
}
