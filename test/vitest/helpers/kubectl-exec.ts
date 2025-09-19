/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import * as k8s from "@kubernetes/client-node";
import { PassThrough } from "stream";

// Helper function to exec into a pod and wait for completion
export async function execAndWait(
  execClient: k8s.Exec,
  namespace: string,
  podName: string,
  command: string[],
  container: string,
): Promise<void> {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  let status: k8s.V1Status | null = null;

  return new Promise<void>((resolve, reject) => {
    execClient
      .exec(
        namespace,
        podName,
        container,
        command,
        stdout,
        stderr,
        null, // no stdin
        false, // not a TTY
        s => {
          status = s;
        },
      )
      .then(ws => {
        ws.on("error", reject);
        ws.on("close", () => {
          ws.on("close", () => {
            // Allow NonZeroExitCode (expected when path doesn't exist)
            if (status && status.status !== "Success" && status.reason !== "NonZeroExitCode") {
              return reject(
                new Error(`exec failed: ${status.reason ?? status.message ?? "unknown"}`),
              );
            }
            resolve();
          });
          resolve();
        });
      })
      .catch(reject);
  });
}
