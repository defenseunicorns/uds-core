import { Capability, PeprModule } from "pepr";

import cfg from "./package.json";

import { policies } from "./src/policies";
import { istio } from "./src/istio/pepr";

/**
 * This the root of the UDS Core Pepr Module. To operate on a specific source package, you can
 * set the `UDS_PKG` environment variable to the name of the package.
 *
 * Example:
 * UDS_PKG=istio npx pepr build
 */
const sortedCapabilities: Record<string, Capability>[] = [
  // UDS Core Policies
  { policies },

  // Istio service mesh
  { istio },
];

// Otherwise, use all capabilities
const allCapabilities = sortedCapabilities.flatMap(data => {
  return Object.values(data).flat();
});

const pkg = process.env.UDS_PKG;

if (!pkg || pkg === "all") {
  // Start the Pepr module
  new PeprModule(cfg, allCapabilities);
} else {
  console.log(
    `\n\n************** Pepr capabilities limited to only ${pkg} source package **************n\n`,
  );

  // If the UDS_PKG environment variable is set, then only use that source package
  const activeCapability = sortedCapabilities.find(data => data[pkg])?.[pkg];

  if (!activeCapability) {
    console.error(`Source package ${pkg} not found. Exiting...`);
    process.exit(1);
  }

  // Start the Pepr module
  new PeprModule(cfg, [activeCapability]);
}
