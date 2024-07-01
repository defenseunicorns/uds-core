import { Log } from "pepr";

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
  // Track if we are running a single test mode
  isSingleTest: process.env.UDS_SINGLE_TEST === "true",
  // Allow UDS policy exemptions to be used in any namespace
  allowAllNSExemptions: process.env.UDS_ALLOW_ALL_NS_EXEMPTIONS === "true",
};

Log.info(UDSConfig, "Loaded UDS Config");

if (UDSConfig.isSingleTest) {
  Log.warn(
    "Running in single test mode, this will change the behavior of the operator and should only be used for UDS Core development testing.",
  );
}
