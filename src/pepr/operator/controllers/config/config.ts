/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s, kind } from "pepr";
import { Component, setupLogger } from "../../../logger";
import { ClusterConfig } from "../../crd";
import { validateCfg } from "../../crd/validators/clusterconfig-validator";
import { reconcileAuthservice } from "../keycloak/authservice/authservice";
import { Action, AuthServiceEvent } from "../keycloak/authservice/types";
import { initAPIServerCIDR } from "../network/generators/kubeAPI";
import { initAllNodesTarget } from "../network/generators/kubeNodes";
import { isBase64 } from "../utils";
import { Config } from "./types";

// Set default UDSConfig for build time compiling
export let UDSConfig: Config = {
  domain: "",
  adminDomain: "",
  caCert: "",
  authserviceRedisUri: "",
  allowAllNSExemptions: false,
  kubeApiCidr: "",
  kubeNodeCidrs: [],
  isIdentityDeployed: false,
};

export const configLog = setupLogger(Component.CONFIG);

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

  // Handle changes to the Authservice configuration
  if (decodedCfgData.AUTHSERVICE_REDIS_URI !== UDSConfig.authserviceRedisUri) {
    // Account for undefined or placeholder values (dev mode)
    if (
      decodedCfgData.AUTHSERVICE_REDIS_URI &&
      decodedCfgData.AUTHSERVICE_REDIS_URI !== "###ZARF_VAR_AUTHSERVICE_REDIS_URI###"
    ) {
      UDSConfig.authserviceRedisUri = decodedCfgData.AUTHSERVICE_REDIS_URI;
    } else {
      UDSConfig.authserviceRedisUri = "";
    }

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

export async function updateCfg(cfg: ClusterConfig) {
  configLog.info("Updating UDS Config from uds-operator-config ClusterConfig change");

  const { expose, policy, networking } = cfg.spec!;

  // Handle changes to the Authservice configuration
  if (expose.caCert !== UDSConfig.caCert) {
    if (expose.caCert && expose.caCert !== "###ZARF_VAR_CA_CERT###") {
      UDSConfig.caCert = expose.caCert;
    } else {
      UDSConfig.caCert = "";
    }

    // Validate that the cacert is base64 encoded (it should be)
    if (UDSConfig.caCert) {
      if (!isBase64(UDSConfig.caCert)) {
        configLog.error(
          "Invalid CA Cert provided in uds-operator-config ClusterConfig, falling back to no CA Cert",
        );
        UDSConfig.caCert = "";
      }
    }

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

  // Handle changes to the kubeApiCidr
  if (networking?.kubeapiCIDR !== UDSConfig.kubeApiCidr) {
    UDSConfig.kubeApiCidr = networking?.kubeapiCIDR;
    // This re-runs the "init" function to update netpols if necessary
    configLog.debug("Updating KubeAPI network policies based on change to kubeApiCidr");
    await initAPIServerCIDR();
  }

  if (!areKubeNodeCidrsEqual(networking?.kubenodeCIDRS, UDSConfig.kubeNodeCidrs)) {
    UDSConfig.kubeNodeCidrs = networking?.kubenodeCIDRS || [];
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
    const cfgList = await K8s(ClusterConfig).InNamespace("pepr-system").Get();
    const cfgSecret = await K8s(kind.Secret).InNamespace("pepr-system").Get("uds-operator-config");

    if (cfgList.items.length === 0) {
      throw new Error("No ClusterConfig found");
    }

    // Important check in case additional configs are created in window between uds-operator-config chart and pepr module chart
    if (cfgList.items.length > 1) {
      throw new Error(
        `ClusterConfig Processing: only one ClusterConfig is allowed -- found: ${cfgList.items.length}`,
      );
    }

    try {
      validateCfg(cfgList.items[0]);
      setConfig(cfgList.items[0], cfgSecret);
    } catch (e) {
      configLog.error(e);
      throw e;
    }
  }
}

export function setConfig(cfg: ClusterConfig, cfgSecret: kind.Secret | undefined) {
  const secretData = cfgSecret ? decodeSecret(cfgSecret) : {};

  let domain = cfg.spec?.expose.domain;
  let adminDomain = cfg.spec?.expose.adminDomain;
  let caCert = cfg.spec?.expose.caCert;
  let authserviceRedisUri = secretData.AUTHSERVICE_REDIS_URI;

  // We need to handle `npx pepr <>` commands that will not template the env vars
  if (!domain || domain === "###ZARF_VAR_DOMAIN###") {
    domain = "uds.dev";
  }
  if (!adminDomain || adminDomain === "###ZARF_VAR_ADMIN_DOMAIN###") {
    adminDomain = `admin.${domain}`;
  }
  if (!caCert || caCert === "###ZARF_VAR_CA_CERT###") {
    caCert = "";
  }
  if (!authserviceRedisUri || authserviceRedisUri === "###ZARF_VAR_AUTHSERVICE_REDIS_URI###") {
    authserviceRedisUri = "";
  }

  UDSConfig = {
    // Set the base domain (tenant) and admin domain
    domain,
    adminDomain,
    // Base64 Encoded Trusted CA cert for Istio certificates (i.e. for `sso.domain`)
    caCert,

    // Allow UDS policy exemptions to be used in any namespace
    allowAllNSExemptions: cfg.spec?.policy.allowAllNsExemptions === true,

    // Redis URI for Authservice
    authserviceRedisUri,

    // Static CIDR range to use for KubeAPI instead of k8s watch
    kubeApiCidr: cfg.spec?.networking?.kubeapiCIDR || "",

    // Static CIDRs to use for KubeNodes instead of k8s watch. Comma separated list of CIDRs.
    kubeNodeCidrs: cfg.spec?.networking?.kubenodeCIDRS || [],

    // Track if UDS Core identity-authorization layer is deployed
    isIdentityDeployed: false,
  };

  configLog.info(UDSConfig, "Loaded UDS Config");
}

function areKubeNodeCidrsEqual(newCidrs: string[] = [], currentCidrs: string[] = []): boolean {
  if (newCidrs.length !== currentCidrs.length) {
    return false;
  }
  const sortedNewCidrs = [...newCidrs].sort();
  const sortedCurrentCidrs = [...currentCidrs].sort();
  return sortedNewCidrs.every((cidr, index) => cidr === sortedCurrentCidrs[index]);
}
