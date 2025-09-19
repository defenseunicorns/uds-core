/**
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

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
