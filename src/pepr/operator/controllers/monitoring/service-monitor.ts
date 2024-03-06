import { K8s, Log, kind } from "pepr";

import { Monitoring, UDSPackage, getOwnerRef } from "../../crd";
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
  const payloads: Monitoring.ServiceMonitor[] = [];

  for (const monitor of monitorList) {
    const name = generateSMName(pkg, monitor);
    const tlsConfig = {
      caFile: "/etc/prom-certs/root-cert.pem",
      certFile: "/etc/prom-certs/cert-chain.pem",
      keyFile: "/etc/prom-certs/key.pem",
      insecureSkipVerify: true,
    };
    const endpoints: Monitoring.Endpoint[] = [
      {
        scheme: Monitoring.Scheme.HTTPS,
        tlsConfig: tlsConfig,
        port: monitor.port,
      },
    ];
    const selector: Monitoring.Selector = {
      matchLabels: monitor.selector,
    };
    const payload: Monitoring.ServiceMonitor = {
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
    await K8s(Monitoring.ServiceMonitor).Apply(payload, { force: true });

    payloads.push(payload);
  }

  // Get all related ServiceMonitors in the namespace
  const serviceMonitors = await K8s(Monitoring.ServiceMonitor)
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
    await K8s(Monitoring.ServiceMonitor).Delete(sm);
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

// todo: should we even do this?
/**
 * Mutate a service monitor to enable mTLS metrics
 *
 * @param sm Service Monitor
 */
export async function mutateServiceMonitor(sm: Monitoring.ServiceMonitor) {
  const namespaces = sm.Raw.spec.namespaceSelector?.matchNames || [sm.Raw.metadata?.namespace];
  let istioInjected = false;
  for (const ns of namespaces) {
    const namespace = await K8s(kind.Namespace).Get(ns);
    if (namespace.metadata?.labels && namespace.metadata.labels["istio-injection"] === "enabled") {
      istioInjected = true;
    }
  }

  if (istioInjected) {
    Log.info(`Patching service monitor ${sm.Raw.metadata.name} for mTLS metrics`);
    const tlsConfig = {
      caFile: "/etc/prom-certs/root-cert.pem",
      certFile: "/etc/prom-certs/cert-chain.pem",
      keyFile: "/etc/prom-certs/key.pem",
      insecureSkipVerify: true,
    };

    const endpoints: Monitoring.Endpoint[] = sm.Raw.spec.endpoints;
    endpoints.forEach(endpoint => {
      endpoint.scheme = Monitoring.Scheme.HTTPS;
      endpoint.tlsConfig = tlsConfig;
    });
    sm.Raw.spec.endpoints = endpoints;
  } else {
    Log.info(`No mutations needed for service monitor ${sm.Raw.metadata?.name}`);
  }
}
