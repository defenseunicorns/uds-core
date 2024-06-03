import { K8s, Log, kind } from "pepr";

import { v1alpha1 as exemption } from "./sources/exemption/v1alpha1";
import { v1alpha1 as pkg } from "./sources/package/v1alpha1";

export async function registerCRDs() {
  // Register the Package CRD if we're in watch or dev mode
  if (process.env.PEPR_WATCH_MODE === "true" || process.env.PEPR_MODE === "dev") {
    await K8s(kind.CustomResourceDefinition)
      .Apply(
        {
          apiVersion: "apiextensions.k8s.io/v1",
          kind: "CustomResourceDefinition",
          metadata: {
            name: "packages.uds.dev",
          },
          spec: {
            group: "uds.dev",
            versions: [pkg],
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
        Log.info("Package CRD registered");
      })
      .catch(err => {
        Log.error({ err }, "Failed to register Package CRD");

        // Sad times, let's exit
        process.exit(1);
      });
  }

  // Register the Exemption CRD if we're in "admission" or dev mode (Exemptions are watched by the admission controllers)
  if (process.env.PEPR_WATCH_MODE === "false" || process.env.PEPR_MODE === "dev") {
    await K8s(kind.CustomResourceDefinition)
      .Apply(
        {
          apiVersion: "apiextensions.k8s.io/v1",
          kind: "CustomResourceDefinition",
          metadata: {
            name: "exemptions.uds.dev",
          },
          spec: {
            group: "uds.dev",
            versions: [exemption],
            scope: "Namespaced",
            names: {
              plural: "exemptions",
              singular: "exemption",
              kind: "Exemption",
              shortNames: ["exempt"],
            },
          },
        },
        { force: true },
      )
      .then(() => {
        Log.info("Exemption CRD registered");
      })
      .catch(err => {
        Log.error({ err }, "Failed to register Exemption CRD");

        // Sad times, let's exit
        process.exit(1);
      });
  }
}
