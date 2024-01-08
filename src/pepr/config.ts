export const UDSConfig = {
  domain: process.env.UDS_DOMAIN || "uds.dev",
  istioInstalled: process.env.UDS_WITH_ISTIO === "true",
};
