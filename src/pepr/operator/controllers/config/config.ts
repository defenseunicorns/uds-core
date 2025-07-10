/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s, kind } from "pepr";
import { Component, setupLogger } from "../../../logger";
import { ClusterConfig, ConfigExpose } from "../../crd";
import { validateCfg } from "../../crd/validators/clusterconfig-validator";
import { reconcileAuthservice } from "../keycloak/authservice/authservice";
import { Action, AuthServiceEvent } from "../keycloak/authservice/types";
import { initAPIServerCIDR } from "../network/generators/kubeAPI";
import { initAllNodesTarget } from "../network/generators/kubeNodes";
import { Config } from "./types";

// Set default UDSConfig for build time compiling
export let UDSConfig: Config = {
  domain: "",
  adminDomain: "",
  caCert: "",
  authserviceRedisUri: "",
  allowAllNSExemptions: false,
  kubeApiCIDR: "",
  kubeNodeCIDRs: [],
  isIdentityDeployed: false,
};

export const configLog = setupLogger(Component.OPERATOR_CONFIG);

function decodeSecret(secret: kind.Secret) {
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

export async function updateCfgSecrets(cfg: kind.Secret) {
  configLog.info("Updating UDS Config from uds-operator-config secret change");

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
    const authserviceUpdate: AuthServiceEvent = {
      name: "global-config-update",
      action: Action.UpdateGlobalConfig,
      // Base64 decode the CA cert before passing to the update function
      trustedCA: atob(UDSConfig.caCert),
      redisUri: UDSConfig.authserviceRedisUri,
    };
    configLog.debug("Updating Authservice secret based on change to Redis URI");
    await reconcileAuthservice(authserviceUpdate);
  }
}

async function handleCAUpdate(expose: ConfigExpose) {
  // no caCert key then set to empty string
  if (!Object.keys(expose).includes("caCert")) {
    expose.caCert = "";
  }

  // handle dev mode placeholder
  if (expose.caCert === "###ZARF_VAR_CA_CERT###") {
    expose.caCert = "";
  }

  if (UDSConfig.caCert !== expose.caCert) {
    UDSConfig.caCert = expose.caCert || "";

    const authserviceUpdate: AuthServiceEvent = {
      name: "global-config-update",
      action: Action.UpdateGlobalConfig,
      // Base64 decode the CA cert before passing to the update function
      trustedCA: atob(UDSConfig.caCert),
      redisUri: UDSConfig.authserviceRedisUri,
    };
    configLog.debug("Updating Authservice secret based on change to CA Cert");
    await reconcileAuthservice(authserviceUpdate);
  }
}

export async function updateCfg(cfg: ClusterConfig) {
  configLog.info("Updating UDS Config from uds-operator-config ClusterConfig change");

  const { expose, policy, networking } = cfg.spec!;

  // Handle changes to the Authservice configuration for CA Cert
  await handleCAUpdate(expose);

  // Handle changes to the kubeApiCidr
  if (networking?.kubeApiCIDR !== UDSConfig.kubeApiCIDR) {
    UDSConfig.kubeApiCIDR = networking?.kubeApiCIDR;
    // This re-runs the "init" function to update netpols if necessary
    configLog.debug("Updating KubeAPI network policies based on change to kubeApiCidr");
    await initAPIServerCIDR();
  }

  if (!areKubeNodeCidrsEqual(networking?.kubeNodeCIDRs, UDSConfig.kubeNodeCIDRs)) {
    UDSConfig.kubeNodeCIDRs = networking?.kubeNodeCIDRs || [];
    // This re-runs the "init" function to update netpols if necessary
    configLog.debug("Updating KubeNodes network policies based on change to kubeNodeCidrs");
    await initAllNodesTarget();
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

  configLog.info("Updated UDS Config based on uds-operator-config ClusterConfig changes");
}

export async function loadUDSConfig() {
  // Run in Admission and Watcher pods
  if (process.env.PEPR_WATCH_MODE || process.env.PEPR_MODE === "dev") {
    const cfg = await K8s(ClusterConfig).Get("uds-cluster-config");
    const cfgSecret = await K8s(kind.Secret).InNamespace("pepr-system").Get("uds-operator-config");

    if (!cfg) {
      throw new Error("No ClusterConfig found");
    }

    try {
      validateCfg(cfg);
      await updateCfg(cfg);
      await updateCfgSecrets(cfgSecret || {});
      configLog.info(redactConfig(), "Loaded UDS Config");
    } catch (e) {
      configLog.error(e);
      throw e;
    }
  }
}

function redactConfig() {
  const authserviceRedisUri = UDSConfig.authserviceRedisUri ? "****" : ""
  return { ...UDSConfig, authserviceRedisUri };
}

function areKubeNodeCidrsEqual(newCidrs: string[] = [], currentCidrs: string[] = []): boolean {
  if (newCidrs.length !== currentCidrs.length) {
    return false;
  }
  const sortedNewCidrs = [...newCidrs].sort();
  const sortedCurrentCidrs = [...currentCidrs].sort();
  return sortedNewCidrs.every((cidr, index) => cidr === sortedCurrentCidrs[index]);
}
