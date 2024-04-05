import { K8s, Log } from "pepr";

import { IstioEnvoyFilter, UDSPackage } from "../../crd";
import { getOwnerRef, sanitizeResourceName } from "../utils";

/**
 * Creates an EnvoyFilter for the package namespace
 *
 * @param pkg
 * @param namespace
 */
export async function envoyFilter(pkg: UDSPackage, namespace: string) {
  const pkgName = pkg.metadata!.name!;
  const generation = (pkg.metadata?.generation ?? 0).toString();

  // Get the list of exposed services
  const retainEncodedSlashes = pkg.spec?.network?.retainEncodedSlashes ?? false;

  // Create an EnvoyFilter if retain encoded slashes is false
  if (!retainEncodedSlashes) {
    const name = sanitizeResourceName(`${pkgName}-decode-slashes`);

    const payload: IstioEnvoyFilter.EnvoyFilter = {
      metadata: {
        name,
        namespace,
        labels: {
          "uds/package": pkgName,
          "uds/generation": generation,
        },
        // Use the CR as the owner ref for each EnvoyFilter
        ownerReferences: getOwnerRef(pkg),
      },
      spec: {
        configPatches: [
          {
            applyTo: IstioEnvoyFilter.ApplyTo.NetworkFilter,
            match: {
              context: IstioEnvoyFilter.Context.Any,
              listener: {
                filterChain: {
                  filter: {
                    name: "envoy.filters.network.http_connection_manager",
                  },
                },
              },
            },
            patch: {
              operation: IstioEnvoyFilter.Operation.Merge,
              value: {
                typed_config: {
                  "@type":
                    "type.googleapis.com/envoy.extensions.filters.network.http_connection_manager.v3.HttpConnectionManager",
                  path_with_escaped_slashes_action: "UNESCAPE_AND_FORWARD",
                },
              },
            },
          },
        ],
      },
    };

    Log.debug(payload, `Applying EnvoyFilter ${name}`);

    // Apply the EnvoyFilter and force overwrite any existing policy
    await K8s(IstioEnvoyFilter.EnvoyFilter).Apply(payload, { force: true });
  }

  // Get all related EnvoyFilters in the namespace
  const envoyFilters = await K8s(IstioEnvoyFilter.EnvoyFilter)
    .InNamespace(namespace)
    .WithLabel("uds/package", pkgName)
    .Get();

  // Find any orphaned EnvoyFilters (not matching the current generation)
  const orphanedEF = envoyFilters.items.filter(
    vs => vs.metadata?.labels?.["uds/generation"] !== generation,
  );

  // Delete any orphaned EnvoyFilters
  for (const vs of orphanedEF) {
    Log.debug(vs, `Deleting orphaned EnvoyFilter ${vs.metadata!.name}`);
    await K8s(IstioEnvoyFilter.EnvoyFilter).Delete(vs);
  }
}
