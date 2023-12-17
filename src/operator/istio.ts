import { K8s, Log } from "pepr";
import { V1OwnerReference } from "@kubernetes/client-node";

import { UDSConfig } from "./config";
import { UDSPackage } from "./crd";
import { HTTPRoute, TCPRoute, VirtualService } from "./crd/generated/istio/virtualservice-v1beta1";

/**
 * Creates a VirtualService for each exposed service in the package
 *
 * @param pkg
 * @param namespace
 */
export async function virtualService(pkg: UDSPackage, namespace: string) {
  const { name: pkgName, uid } = pkg.metadata!;

  // Use the CR as the owner ref for each VirtualService
  const ownerReferences: V1OwnerReference[] = [
    {
      apiVersion: pkg.apiVersion!,
      kind: pkg.kind!,
      uid: uid!,
      name: pkgName!,
    },
  ];

  for (const expose of pkg.spec?.network?.expose ?? []) {
    const { gateway, host, port, service, mode } = expose;

    // Use the package name + service name as the VirtualService name
    // This ensures we don't accidentally expose the same service multiple times
    const name = `${pkgName}-${service}`;

    // Create the route to the service
    const route: TCPRoute[] | HTTPRoute[] = [
      {
        destination: {
          // Use the service name as the host
          host: `${service}.${namespace}.svc.cluster.local`,
          // The CRD only uses numeric ports
          port: { number: port },
        },
      },
    ];

    const payload: VirtualService = {
      metadata: {
        name,
        namespace,
        ownerReferences,
      },
      spec: {
        // Use the global DNS domain for the host
        hosts: [`${host}.${UDSConfig.domain}`],
        // Map the gateway (admin, passthrough or tenant) to the VirtualService
        gateways: [`istio-${gateway}-gateway/${gateway}-gateway`],
      },
    };

    // Add the route to the spec based on the mode
    payload.spec![mode ?? "http"] = [{ route }];

    Log.debug(payload, `Applying VirtualService ${name}`);

    // Apply the VirtualService
    await K8s(VirtualService).Apply(payload);
  }
}
