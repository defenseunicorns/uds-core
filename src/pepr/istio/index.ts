/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { Exec, KubeConfig } from "@kubernetes/client-node";
import { Capability, a } from "pepr";
import { Component, setupLogger } from "../logger";

// configure subproject logger
const log = setupLogger(Component.ISTIO);

export const istio = new Capability({
  name: "istio",
  description: "UDS Core Capability for Istio service mesh.",
});

const { When } = istio;

// Keep track of in-progress terminations
const inProgress = new Set<string>();

/**
 * Watch Pods with the "batch.kubernetes.io/job-name" and "service.istio.io/canonical-name" labels
 * to terminate the sidecar after the job completes successfully.
 */
When(a.Pod)
  .IsCreatedOrUpdated()
  .WithLabel("batch.kubernetes.io/job-name")
  .WithLabel("service.istio.io/canonical-name")
  .Watch(async pod => {
    if (!pod.metadata?.name || !pod.metadata.namespace) {
      log.error(pod, `Invalid Pod definition`);
      return;
    }

    const { name, namespace } = pod.metadata;
    const key = `${namespace}/${name}`;

    // Ensure termination isn't already in progress
    if (inProgress.has(key)) {
      return;
    }

    // Only terminate if the pod is running
    if (pod.status?.phase == "Running") {
      // Check all container statuses
      if (!pod.status.containerStatuses) {
        log.error(pod, `Invalid container status in Pod`);
        return;
      }
      const shouldTerminate = pod.status.containerStatuses
        // Ignore the istio-proxy container
        .filter(c => c.name != "istio-proxy")
        // and if ALL are terminated AND restartPolicy is Never or is OnFailure with a 0 exit code then shouldTerminate is true
        .every(
          c =>
            c.state?.terminated &&
            (pod.spec?.restartPolicy == "Never" ||
              (pod.spec?.restartPolicy == "OnFailure" && c.state.terminated.exitCode == 0)),
        );

      if (shouldTerminate) {
        // Mark the pod as seen
        inProgress.add(key);

        log.info(`Attempting to terminate sidecar for ${key}`);
        try {
          const kc = new KubeConfig();
          kc.loadFromDefault();
          const exec = new Exec(kc);

          await exec.exec(
            namespace,
            name,
            "istio-proxy",
            ["pilot-agent", "request", "POST", "/quitquitquit"],
            null, // Could capture exec stdout here
            null, // Could capture exec stderr here
            process.stdin,
            true,
          );

          log.info(`Terminated sidecar for ${key}`);
        } catch (err) {
          log.error({ err }, `Failed to terminate the sidecar for ${key}`);

          // Remove the pod from the seen list
          inProgress.delete(key);
        }
      }
    }
  });
