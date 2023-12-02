import { registerExemptions } from ".";
import { neuvector, monitoring } from "./matchers";

export const exemptPrivileged = registerExemptions([
  neuvector.enforcer,
  neuvector.controller,
  monitoring.promtail,
]);

export const exemptDropAllCapabilities = registerExemptions([
  neuvector.controller,
  neuvector.enforcer,
  neuvector.prometheus,
]);

export const exemptSELinuxTypes = registerExemptions([
  // Promtail needs selinux option type spc_t
  monitoring.promtail,
]);
