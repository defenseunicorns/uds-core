import { childLog } from "./logger";

let domain = process.env.UDS_DOMAIN;

// We need to handle `npx pepr <>` commands that will not template the env vars
if (!domain || domain === "###ZARF_VAR_DOMAIN###") {
  domain = "uds.dev";
}

export const UDSConfig = {
  // Ignore the UDS_DOMAIN if not deployed by Zarf
  domain,
  // Track if we are running a single test mode
  isSingleTest: process.env.UDS_SINGLE_TEST === "true",
  // Allow UDS policy exemptions to be used in any namespace
  allowAllNSExemptions: process.env.UDS_ALLOW_ALL_NS_EXEMPTIONS === "true",
};

// configure subproject logger
const log = childLog("UDS Config");
log.info(UDSConfig, "Loaded UDS Config");

if (UDSConfig.isSingleTest) {
  log.warn(
    "Running in single test mode, this will change the behavior of the operator and should only be used for UDS Core development testing.",
  );
}
