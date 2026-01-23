/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { WatchPhase } from "kubernetes-fluent-client/dist/fluent/shared-types";
import { K8s, kind } from "pepr";
import { Component, setupLogger } from "../../../logger";
import { ClusterConfig, ConfigCABundle, ConfigPhase as Phase } from "../../crd";
import { validateCfg } from "../../crd/validators/clusterconfig-validator";
import {
  buildCABundleContent,
  updateAllCaBundleConfigMaps,
  updateIstioCAConfigMap,
} from "../ca-bundles/ca-bundle";
import { reconcileAuthservice } from "../keycloak/authservice/authservice";
import { Action, AuthServiceEvent } from "../keycloak/authservice/types";
import { initAPIServerCIDR } from "../network/generators/kubeAPI";
import { initAllNodesTarget } from "../network/generators/kubeNodes";
import { registerWatchEventHandlers, watchCfg } from "../utils";
import { Config } from "./types";

export const configLog = setupLogger(Component.OPERATOR_CONFIG);

// Set default UDSConfig for build time compiling
export const UDSConfig: Config = {
  domain: "",
  adminDomain: "",
  caBundle: {
    certs: "",
    includeDoDCerts: false,
    includePublicCerts: false,
    dodCerts: "",
    publicCerts: "",
  },
  authserviceRedisUri: "",
  allowAllNSExemptions: false,
  kubeApiCIDR: "",
  kubeNodeCIDRs: [],
  isIdentityDeployed: false,
};

// Enums for tracking the config action and step of the action
export enum ConfigAction {
  LOAD,
  UPDATE,
}
export enum ConfigStep {
  START,
  FINISH,
}

/**
 * Generates standardized log messages for config operations
 *
 * @param action The config action being performed (LOAD or UPDATE)
 * @param step The step of the action (START or FINISH)
 * @param resourceName The name of the resource being processed
 * @returns A formatted log message string
 */
export function getConfigLogMessage(
  action: ConfigAction,
  step: ConfigStep,
  resourceName: string,
): string {
  const isLoad = action === ConfigAction.LOAD;
  const verb =
    step === ConfigStep.START ? (isLoad ? "Loading" : "Updating") : isLoad ? "Loaded" : "Updated";
  const change = isLoad ? "" : " change";

  return `${verb} UDS Config from ${resourceName}${change}`;
}

/**
 * Determines if cluster resources should be updated based on the action and environment
 *
 * Cluster resources are only updated for UPDATE actions in watcher mode or dev mode.
 * LOAD actions never trigger cluster resource updates to avoid side effects during startup.
 *
 * @param action The config action being performed
 * @returns true if cluster resources should be updated, false otherwise
 */
export function shouldUpdateClusterResources(action: ConfigAction): boolean {
  return (
    action === ConfigAction.UPDATE &&
    (process.env.PEPR_WATCH_MODE === "true" || process.env.PEPR_MODE === "dev")
  );
}

/**
 * Checks if the ClusterConfig should be skipped during UPDATE operations
 *
 * A ClusterConfig is skipped if:
 * - It is currently in Pending state (guards against infinite loop when pepr patches status to Pending)
 * - The current generation has already been processed (observedGeneration matches generation)
 *
 * @param cr The ClusterConfig custom resource to check
 * @returns true if the config should be skipped, false if it should be processed
 */
export function shouldSkip(cr: ClusterConfig) {
  const isPending = cr.status?.phase === Phase.Pending;
  const isCurrentGeneration = cr.metadata?.generation === cr.status?.observedGeneration;

  // The CR is pending and should be skipped
  if (isPending) {
    configLog.trace(cr, `Should skip? Yes, is pending`);
    return true;
  }

  if (isCurrentGeneration) {
    configLog.trace(cr, `Should skip? Yes, current generation already processed`);
    return true;
  }

  configLog.trace(cr, `Should skip? No, not pending or current generation`);

  return false;
}

/**
 * Decodes base64 secret data into plain text values
 *
 * @param secret The Kubernetes secret to decode
 * @returns Object with decoded string values, empty strings for invalid base64
 */
export function decodeSecret(secret: kind.Secret) {
  // Base64 decode the secret data
  const decodedData: { [key: string]: string } = {};
  for (const key in secret.data) {
    try {
      const decodedValue = atob(secret.data[key]);
      if (decodedValue) {
        decodedData[key] = decodedValue;
      } else {
        decodedData[key] = "";
      }
    } catch (e) {
      configLog.error(`Failed to decode secret key: ${key}, error: ${e.message}`);
    }
  }

  return decodedData;
}

/**
 * Processes operator config secret changes and updates the global UDS configuration
 *
 * @param cfg The operator config secret to process
 * @param action The type of action being performed (LOAD or UPDATE)
 */
export async function handleCfgSecret(cfg: kind.Secret, action: ConfigAction) {
  const resourceName = "uds-operator-config secret";
  configLog.info(getConfigLogMessage(action, ConfigStep.START, resourceName));

  // Only update cluster resources in the watcher pod if not on the first load
  const updateClusterResources = shouldUpdateClusterResources(action);

  const decodedCfgData = decodeSecret(cfg);

  // no data key then set to empty string
  if (!Object.keys(decodedCfgData).includes("AUTHSERVICE_REDIS_URI")) {
    decodedCfgData.AUTHSERVICE_REDIS_URI = "";
  }

  // Handle placeholder values (dev mode)
  if (decodedCfgData.AUTHSERVICE_REDIS_URI === "###ZARF_VAR_AUTHSERVICE_REDIS_URI###") {
    decodedCfgData.AUTHSERVICE_REDIS_URI = "";
  }

  // Handle changes to the Authservice configuration
  if (UDSConfig.authserviceRedisUri !== decodedCfgData.AUTHSERVICE_REDIS_URI) {
    UDSConfig.authserviceRedisUri = decodedCfgData.AUTHSERVICE_REDIS_URI;

    if (updateClusterResources) {
      await performAuthserviceUpdate("change to Redis URI");
    }
  }

  configLog.info(getConfigLogMessage(action, ConfigStep.FINISH, resourceName));
}

/**
 * Determines if CA bundle configuration has changed compared to current global state
 *
 * @param caBundle The new CA bundle configuration from ClusterConfig
 * @param dodCerts The DoD certificate string from the ConfigMap
 * @param publicCerts The public certificate string from the ConfigMap
 * @returns true if CA bundle configuration has changed, false otherwise
 */
function caConfigChanged(caBundle: ConfigCABundle, dodCerts: string, publicCerts: string): boolean {
  // Check if user-provided certs changed
  if (UDSConfig.caBundle.certs !== caBundle.certs) {
    return true;
  }

  // Check if DoD cert inclusion setting changed
  if (UDSConfig.caBundle.includeDoDCerts !== (caBundle.includeDoDCerts === true)) {
    return true;
  }

  // Check if public cert inclusion setting changed
  if (UDSConfig.caBundle.includePublicCerts !== (caBundle.includePublicCerts === true)) {
    return true;
  }

  // Check if DoD cert content changed (only if DoD certs are enabled)
  if (caBundle.includeDoDCerts) {
    if (UDSConfig.caBundle.dodCerts !== dodCerts) {
      return true;
    }
  }

  // Check if public cert content changed (only if public certs are enabled)
  if (caBundle.includePublicCerts) {
    if (UDSConfig.caBundle.publicCerts !== publicCerts) {
      return true;
    }
  }

  return false;
}

/**
 * Fetches DoD and Public CA certificates from the uds-ca-certs ConfigMap
 *
 * @returns Object containing dodCACerts and publicCACerts strings, or empty strings if not found
 */
async function fetchCACerts(): Promise<{ dodCerts: string; publicCerts: string }> {
  try {
    const caCertsConfigMap = await K8s(kind.ConfigMap)
      .InNamespace("pepr-system")
      .Get("uds-ca-certs");
    return {
      dodCerts: caCertsConfigMap.data?.["dodCACerts"] || "",
      publicCerts: caCertsConfigMap.data?.["publicCACerts"] || "",
    };
  } catch (e) {
    if (e?.status === 404) {
      configLog.debug("uds-ca-certs ConfigMap not found, proceeding with defaults");
      return { dodCerts: "", publicCerts: "" };
    } else {
      configLog.error(e, "Failed to fetch uds-ca-certs");
      throw e;
    }
  }
}

/**
 * Handles updates to CA bundle configuration including DoD and public certificates
 *
 * @param caBundle The CA bundle configuration from the ClusterConfig
 * @param updateClusterResources Whether to update cluster resources (ConfigMaps, etc.)
 */
async function handleCABundleUpdate(caBundle: ConfigCABundle, updateClusterResources?: boolean) {
  // no caCert then set to empty string
  if (!caBundle.certs) {
    caBundle.certs = "";
  }

  // handle dev mode placeholder
  if (caBundle.certs === "###ZARF_VAR_CA_BUNDLE_CERTS###") {
    caBundle.certs = "";
  } else if (caBundle.certs === "###ZARF_VAR_CA_CERT###") {
    caBundle.certs = "";
  }

  // Load in the DoD and Public certs from the configmap
  const { dodCerts, publicCerts } = await fetchCACerts();

  // Check if CA bundle configuration has changed to determine if reloads/side-effects are needed
  const hasCaConfigChanged = caConfigChanged(caBundle, dodCerts, publicCerts);

  // Update global state for all types of certs
  UDSConfig.caBundle.certs = caBundle.certs || "";
  UDSConfig.caBundle.includeDoDCerts = caBundle.includeDoDCerts === true;
  UDSConfig.caBundle.includePublicCerts = caBundle.includePublicCerts === true;
  UDSConfig.caBundle.dodCerts = dodCerts;
  UDSConfig.caBundle.publicCerts = publicCerts;

  // Handle global updates to Trust Bundle Configmaps and Authservice
  if (updateClusterResources) {
    await performAuthserviceUpdate(
      hasCaConfigChanged ? "Global CA bundle change" : "Idempotent sync",
    );
    await updateAllCaBundleConfigMaps();
  }
}

/**
 * Processes ClusterConfig changes and updates the global UDS configuration
 *
 * For LOAD actions, the config is always processed regardless of pending state to ensure
 * initial configuration is loaded. For UPDATE actions, processing is skipped if the config
 * is pending or already processed.
 *
 * @param cfg The ClusterConfig custom resource to process
 * @param action The type of action being performed (LOAD or UPDATE)
 */
export async function handleCfg(cfg: ClusterConfig, action: ConfigAction) {
  // Determine if we need to skip processing
  // Don't skip on initial load - we need to process the config regardless of pending state
  if (action !== ConfigAction.LOAD && shouldSkip(cfg)) {
    return;
  }

  try {
    // Patch the status to Pending and set currentGeneration while we process the update
    await K8s(ClusterConfig).PatchStatus({
      metadata: {
        name: cfg.metadata!.name,
      },
      status: {
        phase: Phase.Pending,
      },
    });

    const resourceName = "uds-operator-config ClusterConfig";
    configLog.info(getConfigLogMessage(action, ConfigStep.START, resourceName));

    // Only update cluster resources in the watcher pod if not on the first load
    const updateClusterResources = shouldUpdateClusterResources(action);

    const { expose, policy, networking, caBundle } = cfg.spec!;

    // Handle changes to the Authservice configuration for CA Cert
    await handleCABundleUpdate(caBundle || {}, updateClusterResources);

    // Handle changes to the kubeApiCidr
    if (networking?.kubeApiCIDR !== UDSConfig.kubeApiCIDR) {
      UDSConfig.kubeApiCIDR = networking?.kubeApiCIDR || "";
      if (updateClusterResources) {
        // This re-runs the "init" function to update netpols if necessary
        configLog.debug("Updating KubeAPI network policies based on change to kubeApiCidr");
        await initAPIServerCIDR();
      }
    }

    if (!areKubeNodeCidrsEqual(networking?.kubeNodeCIDRs, UDSConfig.kubeNodeCIDRs)) {
      UDSConfig.kubeNodeCIDRs = networking?.kubeNodeCIDRs || [];
      if (updateClusterResources) {
        // This re-runs the "init" function to update netpols if necessary
        configLog.debug("Updating KubeNodes network policies based on change to kubeNodeCidrs");
        await initAllNodesTarget();
      }
    }

    if (expose.domain !== UDSConfig.domain || expose.adminDomain !== UDSConfig.adminDomain) {
      if (expose.domain && expose.domain !== "###ZARF_VAR_DOMAIN###") {
        UDSConfig.domain = expose.domain;
      } else {
        UDSConfig.domain = "uds.dev";
      }
      if (expose.adminDomain && expose.adminDomain !== "###ZARF_VAR_ADMIN_DOMAIN###") {
        UDSConfig.adminDomain = expose.adminDomain;
      } else {
        UDSConfig.adminDomain = `admin.${UDSConfig.domain}`;
      }
      // todo: Add logic to handle domain changes and update across virtualservices, authservice config, etc
    }

    // Update other config values (no need for special handling)
    UDSConfig.allowAllNSExemptions = policy.allowAllNsExemptions === true;

    configLog.info(getConfigLogMessage(action, ConfigStep.FINISH, resourceName));

    // Finally, patch status to Ready and set observedGeneration
    await K8s(ClusterConfig).PatchStatus({
      metadata: {
        name: cfg.metadata!.name,
      },
      status: {
        phase: Phase.Ready,
        observedGeneration: cfg.metadata!.generation,
      },
    });
  } catch (e) {
    configLog.error("Error processing ClusterConfig", e);

    // patch status to Failed and set observedGeneration
    await K8s(ClusterConfig).PatchStatus({
      metadata: {
        name: cfg.metadata!.name,
      },
      status: {
        phase: Phase.Failed,
        observedGeneration: cfg.metadata!.generation,
      },
    });

    throw e;
  }
}

/**
 * Loads the initial UDS configuration from ClusterConfig and operator secret on startup
 *
 * This function only runs in watcher pods or dev mode. It fetches the ClusterConfig
 * and operator secret, validates them, and populates the global UDS configuration.
 *
 * @throws {Error} When configuration resources cannot be found or are invalid
 */
export async function loadUDSConfig() {
  // Run in Admission and Watcher pods
  if (process.env.PEPR_WATCH_MODE || process.env.PEPR_MODE === "dev") {
    let cfg: ClusterConfig = {};
    let cfgSecret: kind.Secret = {};

    try {
      cfg = await K8s(ClusterConfig).Get("uds-cluster-config");
      // Make sure we got the cluster config even if K8s call succeeded
      if (!cfg) {
        throw new Error("'uds-cluster-config' not found");
      }
    } catch (e) {
      configLog.error("Error while fetching cluster config", e);
      throw new Error("Error while fetching cluster config", { cause: e });
    }

    try {
      cfgSecret = await K8s(kind.Secret).InNamespace("pepr-system").Get("uds-operator-config");
      // Make sure we got the secret even if K8s call succeeded
      if (!cfgSecret) {
        throw new Error("'uds-operator-config' not found");
      }
    } catch (e) {
      configLog.error("Error while fetching operator config secret", e);
      throw new Error("Error while fetching operator config secret", { cause: e });
    }

    try {
      validateCfg(cfg);

      // Pre-fetch DoD/Public certs from the ConfigMap to populate UDSConfig before the initial sync
      const { dodCerts, publicCerts } = await fetchCACerts();
      UDSConfig.caBundle.dodCerts = dodCerts;
      UDSConfig.caBundle.publicCerts = publicCerts;
      if (dodCerts || publicCerts) {
        configLog.debug("Pre-fetched DoD/Public certs during loadUDSConfig");
      }

      await handleCfg(cfg, ConfigAction.LOAD);
      await handleCfgSecret(cfgSecret, ConfigAction.LOAD);

      // Ensure Istio CA ConfigMap is created during initial load
      // istiod now depends on the 'uds-trust-bundle' ConfigMap
      await updateIstioCAConfigMap();

      configLog.info(redactConfig(), "Loaded UDS Config");
    } catch (e) {
      configLog.error(e);
      throw e;
    }
  }
}

/**
 * Creates a redacted copy of UDS config for logging (hides sensitive or large values)
 *
 * @returns UDS config with sensitive or large fields replaced with masked values
 */
function redactConfig() {
  const authserviceRedisUri = UDSConfig.authserviceRedisUri ? "****" : "";
  const dodCerts = UDSConfig.caBundle.dodCerts ? "****" : "";
  const publicCerts = UDSConfig.caBundle.publicCerts ? "****" : "";
  const certs = UDSConfig.caBundle.certs ? "****" : "";
  const caBundle = { ...UDSConfig.caBundle, dodCerts, publicCerts, certs };
  return { ...UDSConfig, authserviceRedisUri, caBundle };
}

// Helper function to detect if 2 lists of CIDRs are equal, irrespective of order
function areKubeNodeCidrsEqual(newCidrs: string[] = [], currentCidrs: string[] = []): boolean {
  if (newCidrs.length !== currentCidrs.length) {
    return false;
  }
  const sortedNewCidrs = [...newCidrs].sort();
  const sortedCurrentCidrs = [...currentCidrs].sort();
  return sortedNewCidrs.every((cidr, index) => cidr === sortedCurrentCidrs[index]);
}

/**
 * Triggers an authservice configuration update with current global config values
 *
 * @param reason Description of what triggered the authservice update
 */
async function performAuthserviceUpdate(reason: string) {
  const authserviceUpdate: AuthServiceEvent = {
    name: "global-config-update",
    action: Action.UpdateGlobalConfig,
    // Note: Use the combined CA bundle (User + DoD + Public) for Authservice trust.
    // Authservice needs the raw PEM content, not base64. buildCABundleContent() gives us the combined, decoded string it expects.
    trustedCA: buildCABundleContent(),
    redisUri: UDSConfig.authserviceRedisUri,
  };
  configLog.debug(`Updating Authservice secret based on: ${reason}`);
  await reconcileAuthservice(authserviceUpdate);
}

/**
 * Handles updates to the uds-ca-certs ConfigMap by updating the global UDS config
 * and propagating changes to all CA bundle ConfigMaps across the cluster
 *
 * @param configMap The updated uds-ca-certs ConfigMap
 */
export async function handleUDSCACertsConfigMapUpdate(configMap: kind.ConfigMap): Promise<void> {
  try {
    configLog.debug("Processing uds-ca-certs ConfigMap update");

    // Extract cert data from the ConfigMap
    const dodCerts = configMap.data?.["dodCACerts"] || "";
    const publicCerts = configMap.data?.["publicCACerts"] || "";

    // Create a mock caBundle config using current UDSConfig values to check for changes
    const currentCaBundle: ConfigCABundle = {
      certs: UDSConfig.caBundle.certs,
      includeDoDCerts: UDSConfig.caBundle.includeDoDCerts,
      includePublicCerts: UDSConfig.caBundle.includePublicCerts,
    };

    // Check if configuration has changed to determine if reloads/side-effects are needed
    const needsUpdate = caConfigChanged(currentCaBundle, dodCerts, publicCerts);

    if (!needsUpdate) {
      configLog.debug("No CA bundle updates needed, skipping");
      return;
    }

    // Update UDSConfig with the new DoD/public cert data
    UDSConfig.caBundle.dodCerts = dodCerts;
    UDSConfig.caBundle.publicCerts = publicCerts;
    configLog.debug("Updated UDSConfig with new DoD and public CA certs");

    // Propagate the changes to all CA bundle ConfigMaps across the cluster
    await updateAllCaBundleConfigMaps();
    configLog.debug("Successfully updated all CA bundle ConfigMaps");
  } catch (error) {
    configLog.error(error, "Failed to process uds-ca-certs ConfigMap update");
    throw error;
  }
}

/**
 * Starts a watch of the ClusterConfig resource for handling configuration updates
 *
 * This function only runs in admission controller pods or dev mode. It sets up
 * a watch to listen for changes to the ClusterConfig and processes
 * them using UPDATE actions.
 */
export async function startConfigWatch() {
  // only run in admission controller or dev mode
  if (process.env.PEPR_WATCH_MODE === "false" || process.env.PEPR_MODE === "dev") {
    const watcher = K8s(ClusterConfig).Watch(async (cfg: ClusterConfig, phase: WatchPhase) => {
      configLog.debug(`Processing cluster config update, phase ${phase}`);

      if (cfg.metadata?.name !== "uds-cluster-config") {
        // This should be impossible based on the schema, but we add this as a safeguard
        return;
      }

      switch (phase) {
        case WatchPhase.Added:
        case WatchPhase.Modified:
          try {
            await handleCfg(cfg, ConfigAction.UPDATE);
          } catch (e) {
            configLog.error(e, "Unexpected error during cluster config update");
          }
          break;
        // We don't expect/handle deletions of the cluster config
      }
    }, watchCfg);
    // This will run until the process is terminated or the watch is aborted
    configLog.debug("Starting cluster config watch...");
    registerWatchEventHandlers(watcher, configLog, "ClusterConfig");
    await watcher.start();
  }
}
