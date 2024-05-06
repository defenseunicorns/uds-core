import { K8s, Log } from "pepr";

import { UDSConfig } from "../../../config";
import {
  Expose,
  Gateway,
  IstioServiceEntry,
  IstioLocation,
  IstioResolution,
  IstioPort,
  IstioEndpoint,
  UDSPackage,
} from "../../crd";
import { getOwnerRef, sanitizeResourceName } from "../utils";

/**
 * Creates a ServiceEntry for each exposed service in the package
 *
 * @param pkg
 * @param namespace
 */
export async function serviceEntry(pkg: UDSPackage, namespace: string) {
  const pkgName = pkg.metadata!.name!;
  const generation = (pkg.metadata?.generation ?? 0).toString();

  // Get the list of exposed services
  const exposeList = pkg.spec?.network?.expose ?? [];

  // Track which ServiceEntries we've created
  const serviceEntryNames: Map<string, boolean> = new Map();

  // Iterate over each exposed service
  for (const expose of exposeList) {
    const { gateway = Gateway.Tenant, host } = expose;

    const name = generateSEName(pkg, expose);

    // If we have already made a ServiceEntry with this name, skip (i.e. if advancedHTTP was used)
    if (serviceEntryNames.get(name)) {
      continue;
    }

    // For the admin gateway, we need to add the path prefix
    const domain = (gateway === Gateway.Admin ? "admin." : "") + UDSConfig.domain;

    // Append the domain to the host
    const fqdn = `${host}.${domain}`;

    const serviceEntryPort: IstioPort = {
      name: "https",
      number: 443,
      protocol: "HTTPS",
    };

    const serviceEntryEndpoint: IstioEndpoint = {
      // Map the gateway (admin, passthrough or tenant) to the ServiceEntry
      address: `${gateway}-ingressgateway.istio-${gateway}-gateway.svc.cluster.local`,
    };

    const payload: IstioServiceEntry = {
      metadata: {
        name,
        namespace,
        labels: {
          "uds/package": pkgName,
          "uds/generation": generation,
        },
        // Use the CR as the owner ref for each ServiceEntry
        ownerReferences: getOwnerRef(pkg),
      },
      spec: {
        // Append the UDS Domain to the host
        hosts: [fqdn],
        location: IstioLocation.MeshInternal,
        resolution: IstioResolution.DNS,
        ports: [serviceEntryPort],
        endpoints: [serviceEntryEndpoint],
      },
    };

    Log.debug(payload, `Applying ServiceEntry ${payload.metadata?.name}`);

    // Apply the ServiceEntry and force overwrite any existing policy
    await K8s(IstioServiceEntry).Apply(payload, { force: true });

    serviceEntryNames.set(name, true);
  }

  // Get all related ServiceEntries in the namespace
  const serviceEntries = await K8s(IstioServiceEntry)
    .InNamespace(namespace)
    .WithLabel("uds/package", pkgName)
    .Get();

  // Find any orphaned ServiceEntries (not matching the current generation)
  const orphanedSE = serviceEntries.items.filter(
    vs => vs.metadata?.labels?.["uds/generation"] !== generation,
  );

  // Delete any orphaned ServiceEntries
  for (const vs of orphanedSE) {
    Log.debug(vs, `Deleting orphaned ServiceEntry ${vs.metadata!.name}`);
    await K8s(IstioServiceEntry).Delete(vs);
  }
}

export function generateSEName(pkg: UDSPackage, expose: Expose) {
  const { gateway = Gateway.Tenant, host, port, service, description } = expose;

  // Ensure the resource name is valid
  const nameSuffix = description || `${host}-${port}-${service}`;
  const name = sanitizeResourceName(`${pkg.metadata!.name}-${gateway}-${nameSuffix}`);

  return name;
}
