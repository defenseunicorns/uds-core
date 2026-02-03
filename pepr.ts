/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { PeprModule } from "pepr";

import cfg from "./package.json";

import { Component, setupLogger } from "./src/pepr/logger";
import { operator } from "./src/pepr/operator";
import {
  loadUDSConfig,
  startConfigWatch,
  UDSConfig,
} from "./src/pepr/operator/controllers/config/config";
import { setupAuthserviceSecret } from "./src/pepr/operator/controllers/keycloak/authservice/config";
import { setupKeycloakClientSecret } from "./src/pepr/operator/controllers/keycloak/config";
import { initAPIServerCIDR } from "./src/pepr/operator/controllers/network/generators/kubeAPI";
import { initAllNodesTarget } from "./src/pepr/operator/controllers/network/generators/kubeNodes";
import { startPackageWatch } from "./src/pepr/operator/controllers/packages/packages";
import { registerCRDs } from "./src/pepr/operator/crd/register";
import { patches } from "./src/pepr/patches";
import { policies, startExemptionWatch } from "./src/pepr/policies";
import { prometheus } from "./src/pepr/prometheus";

const log = setupLogger(Component.STARTUP);

(async () => {
  // Load the UDS Config and register CRDs
  await loadUDSConfig();
  await registerCRDs();
  // KFC watch for cluster config, exemptions, and packages
  await startConfigWatch();
  await startExemptionWatch();
  await startPackageWatch();
  // Initialize API Server and Nodes IPs in-memory
  const networkConfig = {
    kubeApiCIDR: UDSConfig.kubeApiCIDR,
    kubeNodeCIDRs: UDSConfig.kubeNodeCIDRs,
  };
  await initAPIServerCIDR(networkConfig);
  await initAllNodesTarget(networkConfig);
  // Setup Authservice and Keycloak Secrets used by the operator
  await setupAuthserviceSecret();
  await setupKeycloakClientSecret();
  // Start the PeprModule
  new PeprModule(cfg, [
    // UDS Core Operator
    operator,

    // UDS Core Policies
    policies,

    // Prometheus monitoring stack
    prometheus,

    // Patches for specific components
    patches,
  ]);
})().catch(err => {
  log.error(err, "Critical error during startup. Exiting...");
  process.exit(1);
});
