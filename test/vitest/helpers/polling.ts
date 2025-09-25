/**
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

/**
 * Helper function to wait for a specified duration
 */
const wait = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Generic polling function that repeatedly calls a check function until validation passes or timeout
 * @param checkFn - Function to call repeatedly that returns a value to validate
 * @param validateFn - Function that validates the result from checkFn
 * @param description - Description of what is being polled for logging
 * @param timeoutMs - Maximum time to poll before timing out (default: 120000ms)
 * @param intervalMs - Time between polling attempts (default: 10000ms)
 * @returns Promise that resolves to the successful result or throws on timeout
 */
export const pollUntilSuccess = async <T>(
  checkFn: () => Promise<T>,
  validateFn: (result: T) => boolean,
  description: string,
  timeoutMs: number = 120000,
  intervalMs: number = 10000,
): Promise<T> => {
  const startTime = Date.now();
  let attempt = 0;

  while (Date.now() - startTime < timeoutMs) {
    attempt++;
    console.log(`Attempt ${attempt}: ${description}...`);

    try {
      const result = await checkFn();
      if (validateFn(result)) {
        console.log(`Success: ${description}`);
        return result;
      }
      console.log(`Not ready, waiting ${intervalMs / 1000}s...`);
    } catch (error) {
      console.log(`Error: ${error}, retrying in ${intervalMs / 1000}s...`);
    }

    await wait(intervalMs);
  }

  throw new Error(`Timeout after ${timeoutMs / 1000}s waiting for: ${description}`);
};
