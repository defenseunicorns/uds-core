import { Capability, Log, PeprModule } from "pepr";

import cfg from "./package.json";

import { IstioVirtualService } from "./capabilities/istio/pepr/istio-virtual-service";
import { IstioInjection } from "./capabilities/istio/pepr/istio-injection";

/**
 * This the root of the UDS Core Pepr Module. To operate on a specific capability, you can
 * set the `CAPABILITY` environment variable to the name of the capability.
 *
 * Example:
 * CAPABILITY=istio-virtual-service npx pepr build
 */
const allCapabilities: Record<string, Capability[]> = {
  istio: [IstioVirtualService, IstioInjection],
};

// Check if the CAPABILITY environment variable is set
const activeCapabilities = allCapabilities[process.env.CAPABILITY || ""] || [];

// If there are active capabilities via the CAPABILITY environment variable, then log a message
if (activeCapabilities.length > 0) {
  Log.info(
    `\n\n******************* Pepr capabilities limited to only ${process.env.CAPABILITY} capabilities *******************\n\n`,
  );
} else {
  // Otherwise, use all capabilities
  for (const caps of Object.values(allCapabilities)) {
    activeCapabilities.push(...caps);
  }
}

// Start the Pepr module
new PeprModule(cfg, activeCapabilities);
