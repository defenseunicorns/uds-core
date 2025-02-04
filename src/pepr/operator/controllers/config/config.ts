/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s, kind } from "pepr";
import { Component, setupLogger } from "../../../logger";
import { ClusterConfig } from "../../crd";
import { validateCfgCreate } from "../../crd/validators/clusterconfig-validator";
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
  kubeApiCidr: "",
  kubeNodeCidrs: [],
  isIdentityDeployed: false,
};

export const configLog = setupLogger(Component.CONFIG);

export async function updateUDSConfig(config: kind.Secret) {
  configLog.info("Updating UDS Config from uds-operator-config secret change");

  // Base64 decode the secret data
  const decodedConfigData: { [key: string]: string } = {};
  for (const key in config.data) {
    try {
      const decodedValue = atob(config.data[key]);
      if (decodedValue) {
        decodedConfigData[key] = decodedValue;
      } else {
        decodedConfigData[key] = "";
      }
    } catch (e) {
      configLog.error(`Failed to decode secret key: ${key}, error: ${e.message}`);
    }
  }

  // Handle changes to the Authservice configuration
  if (
    decodedConfigData.UDS_CA_CERT !== UDSConfig.caCert ||
    decodedConfigData.AUTHSERVICE_REDIS_URI !== UDSConfig.authserviceRedisUri
  ) {
    UDSConfig.caCert = decodedConfigData.UDS_CA_CERT;
    UDSConfig.authserviceRedisUri = decodedConfigData.AUTHSERVICE_REDIS_URI;

    // Account for undefined or placeholder values (dev mode)
    if (
      !UDSConfig.authserviceRedisUri ||
      UDSConfig.authserviceRedisUri === "###ZARF_VAR_AUTHSERVICE_REDIS_URI###"
    ) {
      UDSConfig.authserviceRedisUri = "";
    }
    if (!UDSConfig.caCert || UDSConfig.caCert === "###ZARF_VAR_CA_CERT###") {
      UDSConfig.caCert = "";
    }
    // Validate that the cacert is base64 encoded (it should be)
    if (UDSConfig.caCert) {
      try {
        atob(UDSConfig.caCert);
      } catch (e) {
        configLog.error(
          "Invalid CA Cert provided in uds-operator-config secret, falling back to no CA Cert",
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
    configLog.debug("Updating Authservice secret based on change to CA Cert or Redis URI");
    await reconcileAuthservice(authserviceUpdate);
  }

  // Handle changes to the kubeApiCidr
  if (decodedConfigData.KUBEAPI_CIDR !== UDSConfig.kubeApiCidr) {
    UDSConfig.kubeApiCidr = decodedConfigData.KUBEAPI_CIDR;
    // This re-runs the "init" function to update netpols if necessary
    configLog.debug("Updating KubeAPI network policies based on change to kubeApiCidr");
    await initAPIServerCIDR();
  }

  // Handle changes to the kubeNodeCidrs
  if (decodedConfigData.KUBENODE_CIDRS !== UDSConfig.kubeNodeCidrs.join(",")) {
    UDSConfig.kubeNodeCidrs = decodedConfigData.KUBENODE_CIDRS.split(",");
    // This re-runs the "init" function to update netpols if necessary
    configLog.debug("Updating KubeNodes network policies based on change to kubeNodeCidrs");
    await initAllNodesTarget();
  }

  if (
    decodedConfigData.UDS_DOMAIN !== UDSConfig.domain ||
    decodedConfigData.UDS_ADMIN_DOMAIN !== UDSConfig.adminDomain
  ) {
    UDSConfig.domain = decodedConfigData.UDS_DOMAIN;
    UDSConfig.adminDomain = decodedConfigData.UDS_ADMIN_DOMAIN;
    if (!UDSConfig.domain || UDSConfig.domain === "###ZARF_VAR_DOMAIN###") {
      UDSConfig.domain = "uds.dev";
    }
    if (!UDSConfig.adminDomain || UDSConfig.adminDomain === "###ZARF_VAR_ADMIN_DOMAIN###") {
      UDSConfig.adminDomain = `admin.${UDSConfig.domain}`;
    }
    // todo: Add logic to handle domain changes and update across virtualservices, authservice config, etc
  }

  // Update other config values (no need for special handling)
  UDSConfig.allowAllNSExemptions = decodedConfigData.UDS_ALLOW_ALL_NS_EXEMPTIONS === "true";

  configLog.info("Updated UDS Config based on uds-operator-config secret changes");
}

export async function loadUDSConfig() {
  // Run in Admission and Watcher pods
  if (process.env.PEPR_WATCH_MODE || process.env.PEPR_MODE === "dev") {
    const cfgList = await K8s(ClusterConfig).InNamespace("pepr-system").Get();
    if (cfgList.items.length === 0) {
      throw new Error("No ClusterConfig found");
    }

    try {
      await validateCfgCreate(cfgList);
      setConfig(cfgList.items[0]);
    } catch (e) {
      configLog.error(e);
      throw e;
    }
  }
}

export function setConfig(cfg: ClusterConfig) {
  let domain = cfg.spec?.expose.domain;
  let adminDomain = cfg.spec?.expose.adminDomain;
  let caCert = cfg.spec?.expose.caCert;
  let authserviceRedisUri = process.env.AUTHSERVICE_REDIS_URI;

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
