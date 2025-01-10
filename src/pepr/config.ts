/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { a, kind } from "pepr";
import { Component, setupLogger } from "./logger";
import { When } from "./operator/common";
import { reconcileAuthservice } from "./operator/controllers/keycloak/authservice/authservice";
import { Action, AuthServiceEvent } from "./operator/controllers/keycloak/authservice/types";

let domain = process.env.UDS_DOMAIN;
let adminDomain = process.env.UDS_ADMIN_DOMAIN;
let caCert = process.env.UDS_CA_CERT;
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

export const UDSConfig = {
  // Set the base domain (tenant) and admin domain
  domain,
  adminDomain,
  // Base64 Encoded Trusted CA cert for Istio certificates (i.e. for `sso.domain`)
  caCert,
  // Allow UDS policy exemptions to be used in any namespace
  allowAllNSExemptions: process.env.UDS_ALLOW_ALL_NS_EXEMPTIONS === "true",

  // Redis URI for Authservice
  authserviceRedisUri,

  // Static CIDR range to use for KubeAPI instead of k8s watch
  kubeApiCidr: process.env.KUBEAPI_CIDR,

  // Static CIDRs to use for KubeNodes instead of k8s watch. Comma separated list of CIDRs.
  kubeNodeCidrs: process.env.KUBENODE_CIDRS,

  // Track if UDS Core identity-authorization layer is deployed
  isIdentityDeployed: false,
};

// configure subproject logger
const log = setupLogger(Component.CONFIG);
log.info(UDSConfig, "Loaded UDS Config");

async function updateUDSConfig(config: kind.Secret) {
  log.info("Updating UDS Config from uds-operator-config secret change");

  // Base64 decode the secret data TODO: Make sure this actually works
  const decodedConfigData: { [key: string]: string } = {};
  for (const key in config.data) {
    if (config.data[key]) {
      const decodedValue = atob(config.data[key]);
      decodedConfigData[key] = decodedValue;
    }
  }

  // Handle changes to the Authservice configuration
  if (
    decodedConfigData.UDS_CA_CERT !== UDSConfig.caCert ||
    decodedConfigData.AUTHSERVICE_REDIS_URI !== UDSConfig.authserviceRedisUri
  ) {
    UDSConfig.caCert = decodedConfigData.UDS_CA_CERT;
    UDSConfig.authserviceRedisUri = decodedConfigData.AUTHSERVICE_REDIS_URI;
    const authserviceUpdate: AuthServiceEvent = {
      name: "global-config-update",
      action: Action.UpdateGlobalConfig,
      trustedCA: UDSConfig.caCert,
      redisUri: UDSConfig.authserviceRedisUri,
    };
    await reconcileAuthservice(authserviceUpdate);
  }

  // Handle changes to the kubeApiCidr
  if (decodedConfigData.KUBEAPI_CIDR !== UDSConfig.kubeApiCidr) {
    UDSConfig.kubeApiCidr = decodedConfigData.KUBEAPI_CIDR;
    // Add logic to reconcile kubeapi netpols
  }

  // Handle changes to the kubeNodeCidrs
  if (decodedConfigData.KUBENODE_CIDRS !== UDSConfig.kubeNodeCidrs) {
    UDSConfig.kubeNodeCidrs = decodedConfigData.KUBENODE_CIDRS;
    // Add logic to reconcile kubenode netpols
  }

  // Handle changes to the domain or adminDomain
  if (
    decodedConfigData.UDS_DOMAIN !== UDSConfig.domain ||
    decodedConfigData.UDS_ADMIN_DOMAIN !== UDSConfig.adminDomain
  ) {
    UDSConfig.domain = decodedConfigData.UDS_DOMAIN;
    UDSConfig.adminDomain = decodedConfigData.UDS_ADMIN_DOMAIN;
    // Add logic to reconcile the domain in the system
  }

  // Update other config values (no need for special handling)
  UDSConfig.allowAllNSExemptions = decodedConfigData.UDS_ALLOW_ALL_NS_EXEMPTIONS === "true";

  log.info(UDSConfig, "Updated UDS Config");
}

// Watch the UDS Operator Config Secret and handle changes
When(a.Secret)
  .IsUpdated()
  .InNamespace("pepr-system")
  .WithName("uds-operator-config")
  .Reconcile(updateUDSConfig);
