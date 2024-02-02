import { Log } from "pepr";

// We need to handle `npx pepr <>` commands that will not template the env vars
const domain = process.env.UDS_DOMAIN;
const isZarfEnv = domain ? domain !== "###ZARF_VAR_DOMAIN###" : false;

export const UDSConfig = {
  // Ignore the UDS_DOMAIN if not deployed by Zarf
  domain: (isZarfEnv && domain) || "uds.dev",
  // Assume Istio is installed if not deployed by Zarf
  istioInstalled: !isZarfEnv || process.env.UDS_WITH_ISTIO === "true",
};

Log.info(UDSConfig, "Loaded UDS Config");
