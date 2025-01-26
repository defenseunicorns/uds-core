/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

// Common imports
import { a } from "pepr";
import { When } from "./common";

// Controller imports
import {
  initAPIServerCIDR,
  updateAPIServerCIDRFromEndpointSlice,
  updateAPIServerCIDRFromService,
} from "./controllers/network/generators/kubeAPI";

// Controller imports
import {
  initAllNodesTarget,
  updateKubeNodesFromCreateUpdate,
  updateKubeNodesFromDelete,
} from "./controllers/network/generators/kubeNodes";

// CRD imports
import { UDSExemption, UDSPackage } from "./crd";
import { validator } from "./crd/validators/package-validator";

// Reconciler imports
import { UDSConfig } from "../config";
import { Component, setupLogger } from "../logger";
import { updateUDSConfig } from "./controllers/config/config";
import { exemptValidator } from "./crd/validators/exempt-validator";
import { packageFinalizer, packageReconciler } from "./reconcilers/package-reconciler";

// Export the operator capability for registration in the root pepr.ts
export { operator } from "./common";

const log = setupLogger(Component.OPERATOR);

// Pre-populate the API server CIDR since we are not persisting the EndpointSlice
// Note ignore any errors since the watch will still be running hereafter
if (process.env.PEPR_WATCH_MODE === "true" || process.env.PEPR_MODE === "dev") {
  void initAPIServerCIDR();
}

// Pre-populate the Node CIDR list since we are not persisting it
// Note ignore any errors since the watch will still be running hereafter
if (process.env.PEPR_WATCH_MODE === "true" || process.env.PEPR_MODE === "dev") {
  void initAllNodesTarget();
}

// Watch for changes to the API server EndpointSlice and update the API server CIDR
// Skip if a CIDR is defined in the UDS Config
if (!UDSConfig.kubeApiCidr) {
  When(a.EndpointSlice)
    .IsCreatedOrUpdated()
    .InNamespace("default")
    .WithName("kubernetes")
    .Reconcile(updateAPIServerCIDRFromEndpointSlice);
}

// Watch for changes to the API server Service and update the API server CIDR
When(a.Service)
  .IsCreatedOrUpdated()
  .InNamespace("default")
  .WithName("kubernetes")
  .Reconcile(updateAPIServerCIDRFromService);

// Watch for changes to the UDSPackage CRD to enqueue a package for processing
When(UDSPackage)
  .IsCreatedOrUpdated()
  // Advanced CR validation
  .Validate(validator)
  // Enqueue the package for processing
  .Reconcile(packageReconciler)
  // Handle finalizer (deletions) for the package
  .Finalize(packageFinalizer);

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

// Watch for changes to the Nodes and update the Node CIDR list
if (!UDSConfig.kubeNodeCidrs) {
  When(a.Node).IsCreatedOrUpdated().Reconcile(updateKubeNodesFromCreateUpdate);
}

// Watch for Node deletions and update the Node CIDR list
if (!UDSConfig.kubeNodeCidrs) {
  When(a.Node).IsDeleted().Reconcile(updateKubeNodesFromDelete);
}

// Watch the UDS Operator Config Secret and handle changes
When(a.Secret)
  .IsUpdated()
  .InNamespace("pepr-system")
  .WithName("uds-operator-config")
  .Reconcile(updateUDSConfig);
