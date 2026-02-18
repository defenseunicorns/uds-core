/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { V1OwnerReference } from "@kubernetes/client-node";
import { K8s } from "pepr";
import { Component, setupLogger } from "../../../logger";
import { Monitor, PrometheusPodMonitor, UDSPackage } from "../../crd";
import { Kind } from "../../crd/generated/package-v1alpha1";
import { FallbackScrapeProtocol } from "../../crd/generated/prometheus/podmonitor-v1";
import { getOwnerRef, purgeOrphans, retryWithDelay } from "../utils";
import { generateMonitorName } from "./common";

// configure subproject logger
const log = setupLogger(Component.OPERATOR_MONITORING);

/**
 * Generate a pod monitor for a pod
 *
 * @param pkg UDS Package
 * @param namespace
 */
export async function podMonitor(pkg: UDSPackage, namespace: string) {
  const pkgName = pkg.metadata!.name!;
  const generation = (pkg.metadata?.generation ?? 0).toString();
  const ownerRefs = getOwnerRef(pkg);

  log.debug(`Reconciling PodMonitors for ${pkgName}`);

  // Get the list of monitored services
  const monitorList = pkg.spec?.monitor ?? [];

  // Create a list of generated PodMonitors
  const payloads: PrometheusPodMonitor[] = [];

  try {
    for (const monitor of monitorList) {
      if (monitor.kind === Kind.PodMonitor) {
        const payload = generatePodMonitor(monitor, namespace, pkgName, generation, ownerRefs);

        log.debug(payload, `Applying PodMonitor ${payload.metadata?.name}`);

        // Apply the PodMonitor and force overwrite any existing policy
        await K8s(PrometheusPodMonitor).Apply(payload, { force: true });

        payloads.push(payload);
      }
    }

    await retryWithDelay(async function purgeOrphanedPodMonitors() {
      return purgeOrphans(generation, namespace, pkgName, PrometheusPodMonitor, log);
    }, log);
  } catch (err) {
    throw new Error(`Failed to process PodMonitors for ${pkgName}, cause: ${JSON.stringify(err)}`);
  }

  // Return the list of monitor names
  return [...payloads.map(m => m.metadata!.name!)];
}

export function generatePodMonitor(
  monitor: Monitor,
  namespace: string,
  pkgName: string,
  generation: string,
  ownerRefs: V1OwnerReference[],
) {
  const { selector, podSelector, portName } = monitor;
  const name = generateMonitorName(pkgName, monitor);
  const payload: PrometheusPodMonitor = {
    metadata: {
      name,
      namespace,
      labels: {
        "uds/package": pkgName,
        "uds/generation": generation,
      },
      ownerReferences: ownerRefs,
    },
    spec: {
      podMetricsEndpoints: [
        {
          port: portName,
          path: monitor.path || "/metrics",
          authorization: monitor.authorization,
        },
      ],
      selector: {
        matchLabels: podSelector ?? selector,
      },
      // Fallback to the Prometheus 2.x default if not defined
      fallbackScrapeProtocol:
        monitor.fallbackScrapeProtocol || FallbackScrapeProtocol.PrometheusText004,
    },
  };

  return payload;
}
