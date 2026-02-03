/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { PeprModule } from "pepr";

import cfg from "./package.json" with { type: "json" };

import { Component, setupLogger } from "./src/pepr/logger.js";
import { operator } from "./src/pepr/operator/common.js";
import { loadUDSConfig, startConfigWatch } from "./src/pepr/operator/controllers/config/config.js";
import { setupAuthserviceSecret } from "./src/pepr/operator/controllers/keycloak/authservice/config.js";
import { setupKeycloakClientSecret } from "./src/pepr/operator/controllers/keycloak/config.js";
import { initAPIServerCIDR } from "./src/pepr/operator/controllers/network/generators/kubeAPI.js";
import { initAllNodesTarget } from "./src/pepr/operator/controllers/network/generators/kubeNodes.js";
import { startPackageWatch } from "./src/pepr/operator/controllers/packages/packages.js";
import { registerCRDs } from "./src/pepr/operator/crd/register.js";
import { patches } from "./src/pepr/patches/index.js";
import { policies } from "./src/pepr/policies/common.js";
import { startExemptionWatch } from "./src/pepr/policies/index.js";
import { prometheus } from "./src/pepr/prometheus/index.js";

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
  await initAPIServerCIDR();
  await initAllNodesTarget();
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
