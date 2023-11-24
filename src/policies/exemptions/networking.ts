import { ExemptList } from ".";
import { neuvector } from "./matchers";

export const restrictHostNamespaces: ExemptList = [
  // Neuvector needs access to the host to inspect network traffic
  neuvector.enforcer,
];
