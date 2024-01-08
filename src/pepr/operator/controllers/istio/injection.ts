import { K8s, kind } from "pepr";

import { UDSPackage } from "../../crd";

/**
 * Syncs the package namespace istio-injection label and adds a label for the package name
 *
 * @param pkg
 */
export async function enableInjection(pkg: UDSPackage) {
  if (!pkg.metadata?.namespace || !pkg.metadata.name) {
    throw new Error(`Invalid Package definition, missing namespace or name`);
  }

  const pkgLabel = `uds/${pkg.metadata.name}`;
  const sourceNS = await K8s(kind.Namespace).Get(pkg.metadata.namespace);
  const labels = sourceNS.metadata?.labels || {};

  // Ensure Istio injection is enabled and the package label is present
  if (labels["istio-injection"] !== "enabled" || !labels[pkgLabel]) {
    labels["istio-injection"] = "enabled";
    labels[pkgLabel] = pkg.metadata.name;

    // Apply the updated Namespace
    await K8s(kind.Namespace).Apply(
      {
        metadata: {
          name: pkg.metadata.namespace,
          labels,
        },
      },
      { force: true },
    );

    // @todo: Add a finalizer to remove the label when the package is deleted
    // @todo: Check for pods without sidecars and address them
  }
}
