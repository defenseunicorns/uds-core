import { registerExemptions } from ".";
import { neuvector } from "./matchers";

export const exemptHostNamespaces = registerExemptions([
  // Neuvector needs access to the host to inspect network traffic
  neuvector.enforcer,
]);
