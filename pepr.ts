/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { PeprModule } from "pepr";

import cfg from "./package.json";

import { Component, setupLogger } from "./src/pepr/logger";
import { operator } from "./src/pepr/operator";
import { setupAuthserviceSecret } from "./src/pepr/operator/controllers/keycloak/authservice/config";
import { registerCRDs } from "./src/pepr/operator/crd/register";
import { patches } from "./src/pepr/patches";
import { policies, startExemptionWatch } from "./src/pepr/policies";
import { prometheus } from "./src/pepr/prometheus";
import { setupKeycloakClientSecret } from "./src/pepr/operator/controllers/keycloak/config";

const log = setupLogger(Component.STARTUP);

(async () => {
  // Apply the CRDs to the cluster
  await registerCRDs();
  // KFC watch for exemptions and update in-memory map
  await startExemptionWatch();
  await setupAuthserviceSecret();
  await setupKeycloakClientSecret();
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
