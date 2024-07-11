import { V1OwnerReference } from "@kubernetes/client-node";
import { K8s } from "pepr";
import { Component, setupLogger } from "../../../logger";
import { Monitor, PrometheusPodMonitor, UDSPackage } from "../../crd";
import { Kind } from "../../crd/generated/package-v1alpha1";
import { getOwnerRef } from "../utils";
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

    // Get all related PodMonitors in the namespace
    const podMonitors = await K8s(PrometheusPodMonitor)
      .InNamespace(namespace)
      .WithLabel("uds/package", pkgName)
      .Get();

    // Find any orphaned PodMonitors (not matching the current generation)
    const orphanedMonitor = podMonitors.items.filter(
      m => m.metadata?.labels?.["uds/generation"] !== generation,
    );

    // Delete any orphaned PodMonitors
    for (const m of orphanedMonitor) {
      log.debug(m, `Deleting orphaned PodMonitor ${m.metadata!.name}`);
      await K8s(PrometheusPodMonitor).Delete(m);
    }
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
  const { selector, portName } = monitor;
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
        matchLabels: selector,
      },
    },
  };

  return payload;
}
