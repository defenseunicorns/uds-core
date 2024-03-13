import { K8s, Log } from "pepr";

import { Prometheus, UDSPackage, getOwnerRef } from "../../crd";
import { Monitor } from "../../crd/generated/package-v1alpha1";
import { sanitizeResourceName } from "../utils";

/**
 * Generate a service monitor for a service
 *
 * @param pkg UDS Package
 * @param namespace
 */
export async function serviceMonitor(pkg: UDSPackage, namespace: string) {
  const pkgName = pkg.metadata!.name!;
  const generation = (pkg.metadata?.generation ?? 0).toString();

  // Get the list of monitored services
  const monitorList = pkg.spec?.monitor ?? [];

  // Create a list of generated ServiceMonitors
  const payloads: Prometheus.ServiceMonitor[] = [];

  for (const monitor of monitorList) {
    const { selector, portName } = monitor;
    const name = generateSMName(pkg, monitor);
    const tlsConfig = {
      caFile: "/etc/prom-certs/root-cert.pem",
      certFile: "/etc/prom-certs/cert-chain.pem",
      keyFile: "/etc/prom-certs/key.pem",
      insecureSkipVerify: true, // Prometheus does not support Istio security naming, thus skip verifying target pod certificate
    };
    const endpoints: Prometheus.Endpoint[] = [
      {
        scheme: Prometheus.Scheme.HTTPS,
        tlsConfig: tlsConfig,
        port: portName,
        path: monitor.path || "/metrics",
      },
    ];
    const promSelector: Prometheus.Selector = {
      matchLabels: selector,
    };
    const payload: Prometheus.ServiceMonitor = {
      metadata: {
        name,
        namespace,
        labels: {
          "uds/package": pkgName,
          "uds/generation": generation,
        },
        ownerReferences: getOwnerRef(pkg),
      },
      spec: {
        endpoints: endpoints,
        selector: promSelector,
      },
    };

    // Apply the VirtualService and force overwrite any existing policy
    await K8s(Prometheus.ServiceMonitor).Apply(payload, { force: true });

    payloads.push(payload);
  }

  // Get all related ServiceMonitors in the namespace
  const serviceMonitors = await K8s(Prometheus.ServiceMonitor)
    .InNamespace(namespace)
    .WithLabel("uds/package", pkgName)
    .Get();

  // Find any orphaned VirtualServices (not matching the current generation)
  const orphanedSM = serviceMonitors.items.filter(
    sm => sm.metadata?.labels?.["uds/generation"] !== generation,
  );

  // Delete any orphaned VirtualServices
  for (const sm of orphanedSM) {
    Log.debug(sm, `Deleting orphaned ServiceMonitor ${sm.metadata!.name}`);
    await K8s(Prometheus.ServiceMonitor).Delete(sm);
  }

  // Return the list of monitor names
  return [...new Set(payloads.map(sm => sm.metadata!.name!).flat())];
}

export function generateSMName(pkg: UDSPackage, monitor: Monitor) {
  const { selector, portName, description } = monitor;

  // Ensure the resource name is valid
  const nameSuffix = description || `${Object.values(selector)}-${portName}`;
  const name = sanitizeResourceName(`${pkg.metadata!.name}-${nameSuffix}`);

  return name;
}
