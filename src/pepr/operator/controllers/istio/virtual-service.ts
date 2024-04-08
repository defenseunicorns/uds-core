import { K8s, Log } from "pepr";

import { UDSConfig } from "../../../config";
import { Expose, Gateway, Istio, UDSPackage } from "../../crd";
import { getOwnerRef, sanitizeResourceName } from "../utils";

/**
 * Creates a VirtualService for each exposed service in the package
 *
 * @param pkg
 * @param namespace
 */
export async function virtualService(pkg: UDSPackage, namespace: string) {
  const pkgName = pkg.metadata!.name!;
  const generation = (pkg.metadata?.generation ?? 0).toString();

  // Get the list of exposed services
  const exposeList = pkg.spec?.network?.expose ?? [];

  // Create a list of generated VirtualServices
  const payloads: Istio.VirtualService[] = [];

  // Iterate over each exposed service
  for (const expose of exposeList) {
    const { gateway = Gateway.Tenant, host, port, service, advancedHTTP = {} } = expose;

    const name = generateVSName(pkg, expose);

    // For the admin gateway, we need to add the path prefix
    const domain = (gateway === Gateway.Admin ? "admin." : "") + UDSConfig.domain;

    // Append the domain to the host
    const fqdn = `${host}.${domain}`;

    const http: Istio.HTTP = { ...advancedHTTP };

    // Create the route to the service
    const route: Istio.HTTPRoute[] = [
      {
        destination: {
          // Use the service name as the host
          host: `${service}.${namespace}.svc.cluster.local`,
          // The CRD only uses numeric ports
          port: { number: port },
        },
      },
    ];

    if (!advancedHTTP.directResponse) {
      // Create the route to the service if not using advancedHTTP.directResponse
      http.route = route;
    }

    const payload: Istio.VirtualService = {
      metadata: {
        name,
        namespace,
        labels: {
          "uds/package": pkgName,
          "uds/generation": generation,
        },
        // Use the CR as the owner ref for each VirtualService
        ownerReferences: getOwnerRef(pkg),
      },
      spec: {
        // Append the UDS Domain to the host
        hosts: [fqdn],
        // Map the gateway (admin, passthrough or tenant) to the VirtualService
        gateways: [`istio-${gateway}-gateway/${gateway}-gateway`],
        // Apply the route to the VirtualService
        http: [http],
      },
    };

    // If the gateway is the passthrough gateway, apply the TLS match
    if (gateway === Gateway.Passthrough) {
      payload.spec!.tls = [
        {
          match: [{ port: 443, sniHosts: [fqdn] }],
          route,
        },
      ];
    }

    Log.debug(payload, `Applying VirtualService ${name}`);

    // Apply the VirtualService and force overwrite any existing policy
    await K8s(Istio.VirtualService).Apply(payload, { force: true });

    payloads.push(payload);
  }

  // Get all related VirtualServices in the namespace
  const virtualServices = await K8s(Istio.VirtualService)
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
    await K8s(Istio.VirtualService).Delete(vs);
  }

  // Return the list of unique hostnames
  return [...new Set(payloads.map(v => v.spec!.hosts!).flat())];
}

export function generateVSName(pkg: UDSPackage, expose: Expose) {
  const { gateway = Gateway.Tenant, host, port, service, description, advancedHTTP } = expose;

  // Ensure the resource name is valid
  const matchHash = advancedHTTP?.match?.flatMap(m => m.name).join("-") || "";
  const nameSuffix = description || `${host}-${port}-${service}-${matchHash}`;
  const name = sanitizeResourceName(`${pkg.metadata!.name}-${gateway}-${nameSuffix}`);

  return name;
}
