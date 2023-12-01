import { registerExemptions } from ".";
import { neuvector, promtail } from "./matchers";

export const exemptPrivileged = registerExemptions([neuvector.enforcer]);

export const exemptDropAllCapabilities = registerExemptions([
  neuvector.enforcer,
  neuvector.prometheus,
]);

export const exemptSELinuxTypes = registerExemptions([
  // Promtail needs selinux option type spc_t
  promtail.promtail,
]);
