/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { Log } from "pepr";

export enum Component {
  STARTUP = "startup",
  CONFIG = "config",
  ISTIO = "istio",
  OPERATOR = "operator",
  OPERATOR_CONFIG = "operator.config",
  OPERATOR_EXEMPTIONS = "operator.exemptions",
  OPERATOR_ISTIO = "operator.istio",
  OPERATOR_KEYCLOAK = "operator.keycloak",
  OPERATOR_AUTHSERVICE = "operator.authservice",
  OPERATOR_MONITORING = "operator.monitoring",
  OPERATOR_UPTIME = "operator.uptime",
  OPERATOR_NETWORK = "operator.network",
  OPERATOR_PACKAGES = "operator.packages",
  OPERATOR_SECRETS = "operator.secrets",
  OPERATOR_GENERATORS = "operator.generators",
  OPERATOR_CRD = "operator.crd",
  OPERATOR_RECONCILERS = "operator.reconcilers",
  OPERATOR_CA_BUNDLE = "operator.ca-bundle",
  POLICIES = "policies",
  POLICIES_EXEMPTIONS = "policies.exemptions",
  PROMETHEUS = "prometheus",
  PATCHES = "patches",
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
