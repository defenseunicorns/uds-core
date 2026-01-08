/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

// Common imports
import { a } from "pepr";
import { When } from "./common";

// Controller imports
import {
  updateAPIServerCIDRFromEndpointSlice,
  updateAPIServerCIDRFromService,
} from "./controllers/network/generators/kubeAPI";

// Resource Pod Reload controllers
import {
  handleConfigMapDelete,
  handleConfigMapUpdate,
  handleSecretDelete,
  handleSecretUpdate,
} from "./controllers/reload/pod-reload";

// Controller imports
import {
  updateKubeNodesFromCreateUpdate,
  updateKubeNodesFromDelete,
} from "./controllers/network/generators/kubeNodes";

// CRD imports
import { ClusterConfig, UDSExemption, UDSPackage } from "./crd";
import { validator } from "./crd/validators/package-validator";

// Reconciler imports
import { Component, setupLogger } from "../logger";
import {
  ConfigAction,
  handleCfg,
  handleCfgSecret,
  handleUDSCACertsConfigMapUpdate,
  UDSConfig,
} from "./controllers/config/config";
import { reconcilePod, reconcileService } from "./controllers/istio/ambient-waypoint";
import { restartGatewayPods } from "./controllers/istio/istio-configmap-sync";
import {
  KEYCLOAK_CLIENTS_SECRET_NAME,
  KEYCLOAK_CLIENTS_SECRET_NAMESPACE,
  updateKeycloakClientsSecret,
} from "./controllers/keycloak/client-secret-sync";
import { validateCfgUpdate } from "./crd/validators/clusterconfig-validator";
import { exemptValidator } from "./crd/validators/exempt-validator";
import { packageFinalizer, packageReconciler } from "./reconcilers/package-reconciler";

// Export the operator capability for registration in the root pepr.ts
export { operator } from "./common";

const log = setupLogger(Component.OPERATOR);

// Watch for changes to the API server EndpointSlice and update the API server CIDR
// Skip if a CIDR is defined in the UDS Config
if (!UDSConfig.kubeApiCIDR) {
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

// Watch for Service mutations to apply ambient waypoint labels
When(a.Service)
  .IsCreatedOrUpdated()
  .Mutate(req => reconcileService(req.Raw));

// Watch for Pod mutations to apply ambient waypoint labels
When(a.Pod)
  .IsCreatedOrUpdated()
  .Mutate(req => reconcilePod(req.Raw));

// Watch for changes to the UDSPackage CRD for processing
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
if (UDSConfig.kubeNodeCIDRs.length === 0) {
  When(a.Node).IsCreatedOrUpdated().Reconcile(updateKubeNodesFromCreateUpdate);
}

// Watch for Node deletions and update the Node CIDR list
if (UDSConfig.kubeNodeCIDRs.length === 0) {
  When(a.Node).IsDeleted().Reconcile(updateKubeNodesFromDelete);
}

// Watch the UDS Operator Config Secret and handle changes
When(a.Secret)
  .IsCreatedOrUpdated()
  .InNamespace("pepr-system")
  .WithName("uds-operator-config")
  .Reconcile(secret => handleCfgSecret(secret, ConfigAction.UPDATE));

// Watch UDS ClusterConfig and handle changes
When(ClusterConfig)
  .IsCreatedOrUpdated()
  .Validate(validateCfgUpdate)
  .Reconcile(cfg => handleCfg(cfg, ConfigAction.UPDATE));

// Watch the uds-ca-certs Configmap and update CA bundle configmaps
When(a.ConfigMap)
  .IsCreatedOrUpdated()
  .InNamespace("pepr-system")
  .WithName("uds-ca-certs")
  .Reconcile(handleUDSCACertsConfigMapUpdate);

// Watch the Kubernetes Clients Secret
When(a.Secret)
  .IsCreatedOrUpdated()
  .InNamespace(KEYCLOAK_CLIENTS_SECRET_NAMESPACE)
  .WithName(KEYCLOAK_CLIENTS_SECRET_NAME)
  .Reconcile(s => updateKeycloakClientsSecret(s, false));

// Watch for secrets with the uds.dev/pod-reload label for pod reload
When(a.Secret)
  .IsCreatedOrUpdated()
  .WithLabel("uds.dev/pod-reload", "true")
  .Reconcile(handleSecretUpdate);

// Watch for deleted secrets to clean up the checksum cache
When(a.Secret).IsDeleted().WithLabel("uds.dev/pod-reload", "true").Reconcile(handleSecretDelete);

// Watch for ConfigMaps with the uds.dev/pod-reload label for pod reload
When(a.ConfigMap)
  .IsCreatedOrUpdated()
  .WithLabel("uds.dev/pod-reload", "true")
  .Reconcile(handleConfigMapUpdate);

// Watch for deleted ConfigMaps to clean up the checksum cache
When(a.ConfigMap)
  .IsDeleted()
  .WithLabel("uds.dev/pod-reload", "true")
  .Reconcile(handleConfigMapDelete);

// Istio Gateway Pods are not restarted automatically when the Istio ConfigMap is updated.
When(a.ConfigMap)
  .IsUpdated()
  .InNamespace("istio-system")
  .WithName("istio")
  .Reconcile(restartGatewayPods);
