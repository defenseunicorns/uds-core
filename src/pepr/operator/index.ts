/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

// Common imports
import { a } from "pepr";
import { When } from "./common";

// Controller imports
import { cleanupNamespace } from "./controllers/istio/injection";
import { purgeSSOClients } from "./controllers/keycloak/client-sync";
import {
  initAPIServerCIDR,
  updateAPIServerCIDRFromEndpointSlice,
  updateAPIServerCIDRFromService,
} from "./controllers/network/generators/kubeAPI";

// CRD imports
import { UDSExemption, UDSPackage } from "./crd";
import { validator } from "./crd/validators/package-validator";

// Reconciler imports
import { UDSConfig } from "../config";
import { Component, setupLogger } from "../logger";
import { purgeAuthserviceClients } from "./controllers/keycloak/authservice/authservice";
import { exemptValidator } from "./crd/validators/exempt-validator";
import { packageReconciler } from "./reconcilers/package-reconciler";

// Secret imports
import { copySecret, labelCopySecret } from "./secrets";

// Export the operator capability for registration in the root pepr.ts
export { operator } from "./common";

const log = setupLogger(Component.OPERATOR);

// Pre-populate the API server CIDR since we are not persisting the EndpointSlice
// Note ignore any errors since the watch will still be running hereafter
void initAPIServerCIDR();

// Watch for changes to the API server EndpointSlice and update the API server CIDR
When(a.EndpointSlice)
  .IsCreatedOrUpdated()
  .InNamespace("default")
  .WithName("kubernetes")
  .Reconcile(updateAPIServerCIDRFromEndpointSlice);

// Watch for changes to the API server Service and update the API server CIDR
When(a.Service)
  .IsCreatedOrUpdated()
  .InNamespace("default")
  .WithName("kubernetes")
  .Reconcile(updateAPIServerCIDRFromService);

// Watch for changes to the UDSPackage CRD and cleanup the namespace mutations
When(UDSPackage)
  .IsDeleted()
  .Watch(async pkg => {
    // Cleanup the namespace
    await cleanupNamespace(pkg);

    // Remove any SSO clients
    await purgeSSOClients(pkg, []);
    await purgeAuthserviceClients(pkg, []);
  });

// Watch for changes to the UDSPackage CRD to enqueue a package for processing
When(UDSPackage)
  .IsCreatedOrUpdated()
  // Advanced CR validation
  .Validate(validator)
  // Enqueue the package for processing
  .Reconcile(packageReconciler);

// Watch for Exemptions and validate
When(UDSExemption).IsCreatedOrUpdated().Validate(exemptValidator);

// Watch for Functional Layers and update config
When(UDSPackage)
  .IsCreatedOrUpdated()
  .InNamespace("keycloak")
  .WithName("keycloak")
  .Watch(() => {
    // todo: wait for keycloak and authservice to be running?
    log.info("Identity and Authorization layer deployed, operator configured to handle SSO.");
    UDSConfig.isIdentityDeployed = true;
  });
When(UDSPackage)
  .IsDeleted()
  .InNamespace("keycloak")
  .WithName("keycloak")
  .Watch(() => {
    log.info("Identity and Authorization layer removed, operator will NOT handle SSO.");
    UDSConfig.isIdentityDeployed = false;
  });

// Watch for secrets w/ the UDS secret label and copy as necessary
When(a.Secret)
  .IsCreatedOrUpdated()
  .WithLabel(labelCopySecret, "true")
  .Mutate(request => copySecret(request));
