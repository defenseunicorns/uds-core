import { K8s, kind } from "pepr";

import { UDSPackage } from "../../crd";

const injectionLabel = "istio-injection";
const injectionAnnotation = "uds.dev/original-istio-injection";

/**
 * Syncs the package namespace istio-injection label and adds a label for the package name
 *
 * @param pkg
 */
export async function enableInjection(pkg: UDSPackage) {
  if (!pkg.metadata?.namespace || !pkg.metadata.name) {
    throw new Error(`Invalid Package definition, missing namespace or name`);
  }

  const sourceNS = await K8s(kind.Namespace).Get(pkg.metadata.namespace);
  const labels = sourceNS.metadata?.labels || {};
  const annotations = sourceNS.metadata?.annotations || {};
  const pkgKey = `uds.dev/${pkg.metadata.name}`;

  // Save the original value of the istio-injection label only if it's not already set
  if (!annotations[injectionLabel]) {
    annotations[injectionAnnotation] = labels[injectionLabel] || "non-existent";
  }

  // Ensure the namespace is configured
  if (!annotations[pkgKey] || labels[injectionLabel] !== "enabled") {
    // Ensure Istio injection is enabled
    labels[injectionLabel] = "enabled";

    // Add the package annotation
    annotations[pkgKey] = "true";

    // Apply the updated Namespace
    await K8s(kind.Namespace).Apply(
      {
        metadata: {
          name: pkg.metadata.namespace,
          labels,
          annotations,
        },
      },
      { force: true },
    );

    // @todo: Check for pods without sidecars and address them
  }
}

/**
 * Restores the namespace
 *
 * @param pkg the package to cleanup
 */
export async function namespaceFinalizer(pkg: UDSPackage) {
  if (!pkg.metadata?.namespace || !pkg.metadata.name) {
    throw new Error(`Invalid Package definition, missing namespace or name`);
  }

  const sourceNS = await K8s(kind.Namespace).Get(pkg.metadata.namespace);
  const labels = sourceNS.metadata?.labels || {};
  const annotations = sourceNS.metadata?.annotations || {};

  // Remove the package annotation
  delete annotations[`uds.dev/${pkg.metadata.name}`];

  // If there are no more UDS Package annotations, restore the original value of the istio-injection label
  if (Object.keys(annotations).find(key => key.startsWith("uds.dev/"))) {
    labels[injectionLabel] = annotations[injectionAnnotation];
    // If the original value was non-existent, remove the label
    if (labels[injectionLabel] === "non-existent") {
      delete labels[injectionLabel];
    }
    delete annotations[injectionAnnotation];
  }

  // Apply the updated Namespace
  await K8s(kind.Namespace).Apply(
    {
      metadata: {
        name: pkg.metadata.namespace,
        labels,
        annotations,
      },
    },
    { force: true },
  );
}
