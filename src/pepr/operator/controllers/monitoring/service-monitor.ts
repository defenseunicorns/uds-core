import { K8s, Log } from "pepr";

import { V1OwnerReference } from "@kubernetes/client-node";
import { Prometheus, UDSPackage, Monitor } from "../../crd";
import { getOwnerRef, sanitizeResourceName } from "../utils";

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

  Log.debug(`Reconciling ServiceMonitors for ${pkgName}`);

  // Get the list of monitored services
  const monitorList = pkg.spec?.monitor ?? [];

  // Create a list of generated ServiceMonitors
  const payloads: Prometheus.ServiceMonitor[] = [];

  try {
    for (const monitor of monitorList) {
      const payload = generateServiceMonitor(monitor, namespace, pkgName, generation, ownerRefs);

      Log.debug(payload, `Applying ServiceMonitor ${payload.metadata?.name}`);

      // Apply the ServiceMonitor and force overwrite any existing policy
      await K8s(Prometheus.ServiceMonitor).Apply(payload, { force: true });

      payloads.push(payload);
    }

    // Get all related ServiceMonitors in the namespace
    const serviceMonitors = await K8s(Prometheus.ServiceMonitor)
      .InNamespace(namespace)
      .WithLabel("uds/package", pkgName)
      .Get();

    // Find any orphaned ServiceMonitors (not matching the current generation)
    const orphanedSM = serviceMonitors.items.filter(
      sm => sm.metadata?.labels?.["uds/generation"] !== generation,
    );

    // Delete any orphaned ServiceMonitors
    for (const sm of orphanedSM) {
      Log.debug(sm, `Deleting orphaned ServiceMonitor ${sm.metadata!.name}`);
      await K8s(Prometheus.ServiceMonitor).Delete(sm);
    }
  } catch (err) {
    throw new Error(
      `Failed to process ServiceMonitors for ${pkgName}, cause: ${JSON.stringify(err)}`,
    );
  }

  // Return the list of monitor names
  return [...payloads.map(sm => sm.metadata!.name!)];
}

export function generateSMName(pkgName: string, monitor: Monitor) {
  const { selector, portName, description } = monitor;

  // Ensure the resource name is valid
  const nameSuffix = description || `${Object.values(selector)}-${portName}`;
  const name = sanitizeResourceName(`${pkgName}-${nameSuffix}`);

  return name;
}

export function generateServiceMonitor(
  monitor: Monitor,
  namespace: string,
  pkgName: string,
  generation: string,
  ownerRefs: V1OwnerReference[],
) {
  const { selector, portName } = monitor;
  const name = generateSMName(pkgName, monitor);
  const payload: Prometheus.ServiceMonitor = {
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
        },
      ],
      selector: {
        matchLabels: selector,
      },
    },
  };

  return payload;
}
