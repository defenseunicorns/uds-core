/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s } from "pepr";

import { V1OwnerReference } from "@kubernetes/client-node";
import { Component, setupLogger } from "../../../logger.js";
import { Kind } from "../../crd/generated/package-v1alpha1.js";
import { FallbackScrapeProtocol } from "../../crd/generated/prometheus/servicemonitor-v1.js";
import { Monitor, PrometheusServiceMonitor, UDSPackage } from "../../crd/index.js";
import { getOwnerRef, purgeOrphans } from "../utils.js";
import { generateMonitorName } from "./common.js";

// configure subproject logger
const log = setupLogger(Component.OPERATOR_MONITORING);

/**
 * Generate a service monitor for a service
 *
 * @param pkg UDS Package
 * @param namespace
 */
export async function serviceMonitor(pkg: UDSPackage, namespace: string) {
  const pkgName = pkg.metadata!.name!;
  const generation = (pkg.metadata?.generation ?? 0).toString();
  const ownerRefs = getOwnerRef(pkg);

  log.debug(`Reconciling ServiceMonitors for ${pkgName}`);

  // Get the list of monitored services
  const monitorList = pkg.spec?.monitor ?? [];

  // Create a list of generated ServiceMonitors
  const payloads: PrometheusServiceMonitor[] = [];

  try {
    for (const monitor of monitorList) {
      if (monitor.kind !== Kind.PodMonitor) {
        const payload = generateServiceMonitor(monitor, namespace, pkgName, generation, ownerRefs);

        log.debug(payload, `Applying ServiceMonitor ${payload.metadata?.name}`);

        // Apply the ServiceMonitor and force overwrite any existing policy
        await K8s(PrometheusServiceMonitor).Apply(payload, { force: true });

        payloads.push(payload);
      }
    }

    await purgeOrphans(generation, namespace, pkgName, PrometheusServiceMonitor, log);
  } catch (err) {
    throw new Error(
      `Failed to process ServiceMonitors for ${pkgName}, cause: ${JSON.stringify(err)}`,
    );
  }

  // Return the list of monitor names
  return [...payloads.map(m => m.metadata!.name!)];
}

export function generateServiceMonitor(
  monitor: Monitor,
  namespace: string,
  pkgName: string,
  generation: string,
  ownerRefs: V1OwnerReference[],
) {
  const { selector, portName } = monitor;
  const name = generateMonitorName(pkgName, monitor);
  const payload: PrometheusServiceMonitor = {
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
      endpoints: [
        {
          port: portName,
          path: monitor.path || "/metrics",
          authorization: monitor.authorization,
        },
      ],
      selector: {
        matchLabels: selector,
      },
      // Fallback to the Prometheus 2.x default if not defined
      fallbackScrapeProtocol:
        monitor.fallbackScrapeProtocol || FallbackScrapeProtocol.PrometheusText004,
    },
  };

  return payload;
}
