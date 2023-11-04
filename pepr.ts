import { Capability, PeprModule } from "pepr";

import cfg from "./package.json";

import { istio } from "./capabilities/istio/pepr";

/**
 * This the root of the UDS Core Pepr Module. To operate on a specific capability, you can
 * set the `CAPABILITY` environment variable to the name of the capability.
 *
 * Example:
 * CAPABILITY=istio-virtual-service npx pepr build\
 */
const sortedCapabilities: Record<string, Capability[]>[] = [
  // Istio service mesh
  { istio },
];

// Otherwise, use all capabilities
const allCapabilities = sortedCapabilities.flatMap(data => {
  return Object.values(data).flat();
});

const capability = process.env.CAPABILITY;

if (!capability) {
  // Start the Pepr module
  new PeprModule(cfg, allCapabilities);
} else {
  console.log(
    `\n\n************** Pepr capabilities limited to only ${capability} capabilities **************n\n`,
  );

  // If the CAPABILITY environment variable is set, then only use that capability
  const activeCapabilities = sortedCapabilities.find(
    data => data[capability],
  )?.[capability];

  if (!activeCapabilities || activeCapabilities.length < 1) {
    console.error(`Capability ${capability} not found. Exiting...`);
    process.exit(1);
  }

  console.log(`Active capabilities: ${activeCapabilities}`);

  // Start the Pepr module
  new PeprModule(cfg, activeCapabilities);
}
