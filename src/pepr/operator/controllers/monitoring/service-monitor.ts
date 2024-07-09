import { K8s } from "pepr";

import { V1OwnerReference } from "@kubernetes/client-node";
import { Component, setupLogger } from "../../../logger";
import { Monitor, PrometheusServiceMonitor, UDSPackage } from "../../crd";
import { getOwnerRef } from "../utils";
import { generateMonitorName } from "./common";

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
  const payloads: PrometheusServiceMonitor.ServiceMonitor[] = [];

  try {
    for (const monitor of monitorList) {
      if (monitor.kind !== "PodMonitor") {
        const payload = generateServiceMonitor(monitor, namespace, pkgName, generation, ownerRefs);

        log.debug(payload, `Applying ServiceMonitor ${payload.metadata?.name}`);

        // Apply the ServiceMonitor and force overwrite any existing policy
        await K8s(PrometheusServiceMonitor.ServiceMonitor).Apply(payload, { force: true });

        payloads.push(payload);
      }
    }

    // Get all related ServiceMonitors in the namespace
    const serviceMonitors = await K8s(PrometheusServiceMonitor.ServiceMonitor)
      .InNamespace(namespace)
      .WithLabel("uds/package", pkgName)
      .Get();

    // Find any orphaned ServiceMonitors (not matching the current generation)
    const orphanedMonitor = serviceMonitors.items.filter(
      m => m.metadata?.labels?.["uds/generation"] !== generation,
    );

    // Delete any orphaned ServiceMonitors
    for (const m of orphanedMonitor) {
      log.debug(m, `Deleting orphaned ServiceMonitor ${m.metadata!.name}`);
      await K8s(PrometheusServiceMonitor.ServiceMonitor).Delete(m);
    }
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
  const payload: PrometheusServiceMonitor.ServiceMonitor = {
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
    },
  };

  return payload;
}
