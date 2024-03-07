import { K8s, Log, kind } from "pepr";

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
    // todo: Get the service to translate port number -> name
    const svc = await K8s(kind.Service).Get("name");
    const portName = svc.spec?.ports?.find(p => p.port === monitor.port)?.name;

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
      },
    ];
    const selector: Prometheus.Selector = {
      matchLabels: monitor.selector,
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
        selector: selector,
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
  // Ensure the resource name is valid
  const nameSuffix = monitor.description || `${monitor.selector}-${monitor.port}`;
  const name = sanitizeResourceName(`${pkg.metadata!.name}-${nameSuffix}`);

  return name;
}
