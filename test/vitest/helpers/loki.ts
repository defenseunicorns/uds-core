/**
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import * as net from "net";

export interface LokiQueryResult {
  status: string;
  data: { result: Array<{ values: string[][] }> };
}

export const queryLoki = async (
  lokiRead: { server: net.Server; url: string },
  query: string,
  limit = 100,
): Promise<LokiQueryResult> => {
  try {
    const response = await fetch(
      `${lokiRead.url}/loki/api/v1/query_range?query=${encodeURIComponent(query)}&limit=${limit}`,
      {
        method: "GET",
      },
    );
    if (!response.ok) throw new Error("Error in querying logs");
    return (await response.json()) as LokiQueryResult;
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error("Error in querying logs", error.message);
      throw error;
    }
    throw new Error("Unknown error in querying logs");
  }
};
