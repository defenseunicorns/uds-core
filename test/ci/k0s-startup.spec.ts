/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
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

describe("k0s startup", () => {
  it.each([true, false])("gates K0s exec on the API listener (available=%s)", available => {
    const setup = actions("tasks/setup.yaml", "k0s-test-cluster-setup");
    const wait = setup.find(
      action => action.description === "Wait for K0s to finish container initialization",
    );
    const command = setup
      .slice(
        2,
        setup.findIndex(action => action.description === "Get K0s kubeconfig"),
      )
      .map(action => action.cmd)
      .join("\n");
    const result = spawnSync(
      "bash",
      [
        "-ec",
        `
      docker() {
        case "$1" in
          build) ;;
          run) started=true ;;
          exec)
            if [ "\${api_ready:-}" != true ]; then
              echo "exec before K0s initialized its cgroups" >&2
              exit 1
            fi
            case "$3" in
              k0s)
                if [ "$4" = version ]; then echo "$DEFAULT_K0S_VERSION"; fi
                ;;
              mount) echo mount ;;
            esac
            ;;
        esac
      }
      curl() {
        [ "$started" = true ] && [[ "$*" == *" https://127.0.0.1:6443/livez" ]] &&
          [ "${available}" = true ] || return 1
        api_ready=true
      }
      sleep() { echo "retry delay"; }
      ${command}
    `,
      ],
      { env: { PATH: process.env.PATH, DEFAULT_K0S_VERSION: "v1.0.0+k0s.1" }, encoding: "utf8" },
    );
    expect(result.stderr).toBe("");
    expect(result.status).toBe(available ? 0 : 1);
    expect(result.stdout).toBe(available ? "mount\n" : "retry delay\n");
    expect(wait?.maxRetries ?? 0).toBeGreaterThan(0);
  });
});
