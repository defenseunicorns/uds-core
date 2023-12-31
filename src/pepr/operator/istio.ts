import { K8s, Log } from "pepr";
import { V1OwnerReference } from "@kubernetes/client-node";

import { UDSConfig } from "../config";
import { Gateway, UDSPackage } from "./crd";
import { HTTPRoute, TCPRoute, VirtualService } from "./crd/generated/istio/virtualservice-v1beta1";

/**
 * Creates a VirtualService for each exposed service in the package
 *
 * @param pkg
 * @param namespace
 */
export async function virtualService(pkg: UDSPackage, namespace: string) {
  const pkgName = pkg.metadata!.name!;
  const uid = pkg.metadata!.uid!;

  const generation = (pkg.metadata?.generation ?? 0).toString();

  // Use the CR as the owner ref for each VirtualService
  const ownerReferences: V1OwnerReference[] = [
    {
      apiVersion: pkg.apiVersion!,
      kind: pkg.kind!,
      uid: uid,
      name: pkgName,
    },
  ];

  // Get the list of exposed services
  const exposeList = pkg.spec?.network?.expose ?? [];

  // Iterate over each exposed service
  for (const expose of exposeList) {
    const { gateway = Gateway.Tenant, host, port, service, mode } = expose;

    const name = `${pkgName}-${gateway}-${host}`.toLowerCase();

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

    // For the admin gateway, we need to add the path prefix
    const domain = (gateway === Gateway.Admin ? "admin." : "") + UDSConfig.domain;

    const payload: VirtualService = {
      metadata: {
        name,
        namespace,
        labels: {
          "uds/package": pkgName,
          "uds/generation": generation,
        },
        ownerReferences,
      },
      spec: {
        // Append the UDS Domain to the host
        hosts: [`${host}.${domain}`],
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

  // Get all related VirtualServices in the namespace
  const virtualServices = await K8s(VirtualService)
    .InNamespace(namespace)
    .WithLabel("uds/package", pkgName)
    .Get();

  // Find any orphaned VirtualServices (not matching the current generation)
  const orphanedVS = virtualServices.items.filter(
    vs => vs.metadata?.labels?.["uds/generation"] !== generation,
  );

  // Delete any orphaned VirtualServices
  for (const vs of orphanedVS) {
    Log.debug(vs, `Deleting orphaned VirtualService ${vs.metadata!.name}`);
    await K8s(VirtualService).Delete(vs);
  }
}
