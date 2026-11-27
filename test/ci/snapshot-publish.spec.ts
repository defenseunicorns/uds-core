/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

interface Task {
  name: string;
  actions: { description?: string; cmd?: string; maxRetries?: number }[];
}

function actions(file: string, taskName: string) {
  const { tasks }: { tasks: Task[] } = parse(readFileSync(file, "utf8"));
  const task = tasks.find(task => task.name === taskName);
  if (!task) {
    throw new Error(`Missing task ${taskName} in ${file}`);
  }
  return task.actions;
}

describe("snapshot publish", () => {
  it.each([true, false])(
    "tags latest only after both verified publishes succeed (arm64=%s)",
    arm64 => {
      const [publish, latest] = actions("tasks/publish.yaml", "standard-package").slice(1);
      const directory = mkdtempSync(join(tmpdir(), "uds-publish-unit-"));
      try {
        mkdirSync(join(directory, "build"));
        writeFileSync(
          join(directory, "uds"),
          `#!/bin/bash
        set -e
        case "$3" in
          sign) touch "\${4%.tar.zst}-upstream.tar.zst" ;;
          verify) touch "$4.verified" ;;
          publish)
            test -f "$4.verified"
            test "$5" = oci://registry.example/uds/snapshots
            test "$6 $7" = '--retries 3' || { echo "Missing OCI retries" >&2; exit 1; }
            if [[ "$4" == *-arm64-* ]] && [ "${arm64}" = false ]; then
              echo "OCI retries exhausted" >&2
              exit 1
            fi
            echo "$4"
            ;;
          registry) echo latest ;;
          *) exit 1 ;;
        esac
      `,
          { mode: 0o700 },
        );
        const result = spawnSync("bash", ["-ec", `${publish.cmd}\n${latest.cmd}`], {
          cwd: directory,
          env: {
            PATH: process.env.PATH,
            FLAVOR: "upstream",
            SNAPSHOT: "true",
            TARGET_REPO: "registry.example/uds/snapshots",
            VERSION: "1.2.3",
          },
          encoding: "utf8",
        });
        expect(result.status, result.stderr).toBe(arm64 ? 0 : 1);
        expect(result.stderr).toBe(arm64 ? "" : "OCI retries exhausted\n");
        expect(result.stdout.trim().split("\n").slice(1)).toEqual([
          "build/zarf-package-core-amd64-1.2.3-upstream.tar.zst",
          ...(arm64 ? ["build/zarf-package-core-arm64-1.2.3-upstream.tar.zst", "latest"] : []),
        ]);
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    },
  );
});
