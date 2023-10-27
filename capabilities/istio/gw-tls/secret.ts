import { K8s, kind } from "kubernetes-fluent-client";
//import "./env";

const applySecret = (gw: string) =>
  K8s(kind.Secret).Apply({
    metadata: {
      name: "gw-cert",
      namespace: `istio-${gw}-gateway`.toLocaleLowerCase(),
    },
    type: "kubernetes.io/tls",
    stringData: {
      "tls.crt": process.env[`${gw}_GATEWAY_TLS_CERT`] || "MISSING",
      "tls.key": process.env[`${gw}_GATEWAY_TLS_KEY`] || "MISSING",
    },
  });

Promise.all([
  // Admin Gateway Secret, "*.admin.burning.boats"
  applySecret("ADMIN"),
  // Tenant Gateway Secret, "*.burning.boats"
  applySecret("TENANT"),
])
  // If there's an error, log it and exit with an error code to fail the job.
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
