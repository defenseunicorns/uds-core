import { registerExemptions } from ".";
import { neuvector, promtail } from "./matchers";

export const exemptPrivileged = registerExemptions([neuvector.enforcer, neuvector.controller]);

export const exemptDropAllCapabilities = registerExemptions([
  neuvector.controller,
  neuvector.enforcer,
  neuvector.prometheus,
]);

export const exemptSELinuxTypes = registerExemptions([
  // Promtail needs selinux option type spc_t
  promtail.promtail,
]);
