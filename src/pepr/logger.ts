import { Log } from "pepr";

export enum Component {
  CONFIG = "config",
  ISTIO = "istio",
  OPERATOR_EXEMPTIONS = "operator.exemptions",
  OPERATOR_ISTIO = "operator.istio",
  OPERATOR_KEYCLOAK = "operator.keycloak",
  OPERATOR_MONITORING = "operator.monitoring",
  OPERATOR_NETWORK = "operator.network",
  OPERATOR_GENERATORS = "operator.generators",
  OPERATOR_CRD = "operator.crd",
  OPERATOR_RECONCILERS = "operator.reconcilers",
  POLICIES = "policies",
  POLICIES_EXEMPTIONS = "policies.exemptions",
  PROMETHEUS = "prometheus",
}

export function setupLogger(component: Component) {
  const setupLogger = Log.child({ component });

  // Handle commands that do not template the env vars
  let logLevel = process.env.UDS_LOG_LEVEL;
  if (!logLevel || logLevel === "###ZARF_VAR_UDS_LOG_LEVEL###") {
    logLevel = "debug";
  }

  setupLogger.level = logLevel;

  return setupLogger;
}
