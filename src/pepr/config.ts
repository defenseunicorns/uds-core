import { Component, setupLogger } from "./logger";

let domain = process.env.UDS_DOMAIN;
let caCert = process.env.UDS_CA_CERT;

// We need to handle `npx pepr <>` commands that will not template the env vars
if (!domain || domain === "###ZARF_VAR_DOMAIN###") {
  domain = "uds.dev";
}
if (!caCert || caCert === "###ZARF_VAR_CA_CERT###") {
  caCert = "";
}

export const UDSConfig = {
  // Ignore the UDS_DOMAIN if not deployed by Zarf
  domain,
  // Base64 Encoded Trusted CA cert for Istio certificates (i.e. for `sso.domain`)
  caCert,
  // Allow UDS policy exemptions to be used in any namespace
  allowAllNSExemptions: process.env.UDS_ALLOW_ALL_NS_EXEMPTIONS === "true",
  // Whether Identity & Authorization is deployed or not
  isIdentityDeployed: false,
  // Whether Monitoring is deployed or not
  isMonitoringDeployed: false,
};

// configure subproject logger
const log = setupLogger(Component.CONFIG);
log.info(UDSConfig, "Loaded UDS Config");
