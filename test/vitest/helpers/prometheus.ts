/**
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

/**
 * Queries Prometheus for a specific metric and returns its value
 * @param prometheusUrl - The base URL of the Prometheus instance
 * @param metric - The metric name to query for
 * @returns Promise that resolves to the metric value as a number, or null if not found
 */
export const queryPrometheusMetric = async (
  prometheusUrl: string,
  metric: string,
): Promise<number | null> => {
  try {
    const response = await fetch(
      `${prometheusUrl}/api/v1/query?query=${encodeURIComponent(metric)}`,
    );

    if (!response.ok) {
      throw new Error(`Prometheus API returned ${response.status}`);
    }

    const data = (await response.json()) as {
      status: string;
      data: {
        result: Array<{
          metric: Record<string, string>;
          value: [number, string];
        }>;
      };
    };

    if (data.status !== "success" || !data.data.result.length) {
      return null;
    }

    return parseFloat(data.data.result[0].value[1]);
  } catch (error) {
    throw new Error(`Failed to query Prometheus: ${error}`);
  }
};
