/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { WatchEvent } from "kubernetes-fluent-client";
import { WatchPhase } from "kubernetes-fluent-client/dist/fluent/shared-types";
import { K8s, kind } from "pepr";
import { Component, setupLogger } from "../../../logger";
import { ClusterConfig, ConfigExpose } from "../../crd";
import { validateCfg } from "../../crd/validators/clusterconfig-validator";
import { reconcileAuthservice } from "../keycloak/authservice/authservice";
import { Action, AuthServiceEvent } from "../keycloak/authservice/types";
import { initAPIServerCIDR } from "../network/generators/kubeAPI";
import { initAllNodesTarget } from "../network/generators/kubeNodes";
import { watchCfg } from "../utils";
import { Config } from "./types";

// Set default UDSConfig for build time compiling
export const UDSConfig: Config = {
  domain: "",
  adminDomain: "",
  caCert: "",
  authserviceRedisUri: "",
  allowAllNSExemptions: false,
  kubeApiCIDR: "",
  kubeNodeCIDRs: [],
  isIdentityDeployed: false,
};

// Enums for tracking the config action and "phase" of the action
export enum ConfigAction {
  LOAD,
  UPDATE,
}
export enum ConfigPhase {
  START,
  FINISH,
}

// Helper function to generate config log messages
export function getConfigLogMessage(
  action: ConfigAction,
  phase: ConfigPhase,
  resourceName: string,
): string {
  const isLoad = action === ConfigAction.LOAD;
  const verb =
    phase === ConfigPhase.START ? (isLoad ? "Loading" : "Updating") : isLoad ? "Loaded" : "Updated";
  const change = isLoad ? "" : " change";

  return `${verb} UDS Config from ${resourceName}${change}`;
}

// Helper function to determine if cluster resources should be updated
export function shouldUpdateClusterResources(action: ConfigAction): boolean {
  return (
    action === ConfigAction.UPDATE &&
    (process.env.PEPR_WATCH_MODE === "true" || process.env.PEPR_MODE === "dev")
  );
}

export const configLog = setupLogger(Component.OPERATOR_CONFIG);

// Exported for testing purposes
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

export async function handleCfgSecret(cfg: kind.Secret, action: ConfigAction) {
  const resourceName = "uds-operator-config secret";
  configLog.info(getConfigLogMessage(action, ConfigPhase.START, resourceName));

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

  configLog.info(getConfigLogMessage(action, ConfigPhase.FINISH, resourceName));
}

async function handleCAUpdate(expose: ConfigExpose, updateClusterResources?: boolean) {
  // no caCert then set to empty string
  if (!expose.caCert) {
    expose.caCert = "";
  }

  // handle dev mode placeholder
  if (expose.caCert === "###ZARF_VAR_CA_CERT###") {
    expose.caCert = "";
  }

  if (UDSConfig.caCert !== expose.caCert) {
    UDSConfig.caCert = expose.caCert || "";

    if (updateClusterResources) {
      await performAuthserviceUpdate("change to CA Cert");
    }
  }
}

export async function handleCfg(cfg: ClusterConfig, action: ConfigAction) {
  const resourceName = "uds-operator-config ClusterConfig";
  configLog.info(getConfigLogMessage(action, ConfigPhase.START, resourceName));

  // Only update cluster resources in the watcher pod if not on the first load
  const updateClusterResources = shouldUpdateClusterResources(action);

  const { expose, policy, networking } = cfg.spec!;

  // Handle changes to the Authservice configuration for CA Cert
  await handleCAUpdate(expose, updateClusterResources);

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

  configLog.info(getConfigLogMessage(action, ConfigPhase.FINISH, resourceName));
}

// Loads the UDS Config on startup
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
      await handleCfg(cfg, ConfigAction.LOAD);
      await handleCfgSecret(cfgSecret, ConfigAction.LOAD);
      configLog.info(redactConfig(), "Loaded UDS Config");
    } catch (e) {
      configLog.error(e);
      throw e;
    }
  }
}

// Helper function for redacting sensitive values from the UDS Config
function redactConfig() {
  const authserviceRedisUri = UDSConfig.authserviceRedisUri ? "****" : "";
  return { ...UDSConfig, authserviceRedisUri };
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

// Runs `reconcileAuthservice` with the global config update event based on the current config
async function performAuthserviceUpdate(reason: string) {
  const authserviceUpdate: AuthServiceEvent = {
    name: "global-config-update",
    action: Action.UpdateGlobalConfig,
    // Base64 decode the CA cert before passing to the update function
    trustedCA: atob(UDSConfig.caCert),
    redisUri: UDSConfig.authserviceRedisUri,
  };
  configLog.debug(`Updating Authservice secret based on: ${reason}`);
  await reconcileAuthservice(authserviceUpdate);
}

// Starts a watch of the cluster config, used for Admission pods
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
    await watcher.start();

    function giveUpHandler(err: Error) {
      configLog.error(
        err,
        "WatchEvent GiveUp Error: The cluster config watch has failed to start after several attempts. Exiting...",
      );
      process.exit(1);
    }
    watcher.events.on(WatchEvent.GIVE_UP, giveUpHandler);
  }
}
