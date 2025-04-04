/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { Component, setupLogger } from "./logger";

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

  // Track if Istio Ambient optional components are deployed
  isAmbientDeployed: false,
};

// configure subproject logger
const log = setupLogger(Component.CONFIG);
log.info(UDSConfig, "Loaded UDS Config");
