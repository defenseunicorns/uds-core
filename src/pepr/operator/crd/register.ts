import { K8s, Log, kind } from "pepr";

import { v1alpha1 } from "./sources/v1alpha1";

// Register the CRD if we're in watch or dev mode
if (process.env.PEPR_WATCH_MODE === "true" || process.env.PEPR_MODE === "dev") {
  K8s(kind.CustomResourceDefinition)
    .Apply(
      {
        apiVersion: "apiextensions.k8s.io/v1",
        kind: "CustomResourceDefinition",
        metadata: {
          name: "packages.uds.dev",
        },
        spec: {
          group: "uds.dev",
          versions: [v1alpha1],
          scope: "Namespaced",
          names: {
            plural: "packages",
            singular: "package",
            kind: "Package",
            shortNames: ["pkg"],
          },
        },
      },
      { force: true },
    )
    .then(() => {
      Log.info("CRD registered");
    })
    .catch(err => {
      Log.error(err);

      // Sad times, let's exit
      process.exit(1);
    });
}
