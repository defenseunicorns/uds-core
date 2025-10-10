/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */
import { pollUntilSuccess } from "./polling";

/**
 * Checks if a specific alert is currently firing in Alertmanager
 * @param alertmanagerUrl - The base URL of the Alertmanager instance
 * @param alertName - The name of the alert to check for
 * @returns Promise that resolves to true if the alert is active, false otherwise
 */
export const checkAlertInAlertmanager = async (
  alertmanagerUrl: string,
  alertName: string,
): Promise<boolean> => {
  try {
    const response = await fetch(`${alertmanagerUrl}/api/v2/alerts`);

    if (!response.ok) {
      throw new Error(`Alertmanager API returned ${response.status}`);
    }

    const alerts = (await response.json()) as Array<{
      labels: { alertname: string };
      status: { state: string };
    }>;

    return alerts.some(
      alert => alert.labels.alertname === alertName && alert.status.state === "active",
    );
  } catch (error) {
    throw new Error(`Failed to query Alertmanager: ${error}`);
  }
};

/**
 * Waits for a specific alert to start firing in Alertmanager
 *
 * This function polls Alertmanager until the specified alert becomes active or the timeout is reached.
 * It's useful for integration tests that need to verify alerts are properly configured and firing.
 *
 * @param alertmanagerUrl - The base URL of the Alertmanager instance
 * @param alertName - The name of the alert to wait for
 * @param timeoutMs - Maximum time to wait for the alert in milliseconds (default: 240000ms / 4 minutes)
 * @returns Promise that resolves when the alert is firing, or rejects if timeout is reached
 * @throws Error if the alert doesn't fire within the timeout period
 */
export async function expectAlertFires(
  alertmanagerUrl: string,
  alertName: string,
  timeoutMs = 240000, // 4 minutes default timeout (allows time for alert discovery, state change, and safety buffer)
): Promise<void> {
  await pollUntilSuccess(
    () => checkAlertInAlertmanager(alertmanagerUrl, alertName),
    isAlertFiring => isAlertFiring === true,
    `Checking for ${alertName} alert in AlertManager`,
    timeoutMs,
  );
}
