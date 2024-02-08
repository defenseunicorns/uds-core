const isZarfEnv =
  process.env.UDS_DOMAIN !== "###ZARF_VAR_DOMAIN###" && process.env.UDS_DOMAIN !== undefined;

export const UDSConfig = {
  // Ignore the UDS_DOMAIN if not deployed by Zarf
  domain: (isZarfEnv && process.env.UDS_DOMAIN) || "uds.dev",
  // Assume Istio is installed if not deployed by Zarf
  istioInstalled: !isZarfEnv || process.env.UDS_WITH_ISTIO === "true",
};
