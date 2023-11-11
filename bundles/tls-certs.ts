// Apply using `npx ts-node tls-certs.ts`

import { K8s, fromEnv, kind } from "kubernetes-fluent-client";

const applySecret = (gw: string) =>
  K8s(kind.Secret).Apply({
    metadata: {
      name: "gw-cert",
      namespace: `istio-${gw}-gateway`.toLocaleLowerCase(),
    },
    type: "kubernetes.io/tls",
    data: {
      "tls.crt": fromEnv(`${gw}_GATEWAY_TLS_CERT`),
      "tls.key": fromEnv(`${gw}_GATEWAY_TLS_KEY`),
    },
  });

Promise.all([
  // Admin Gateway Secret, "*.admin.burning.boats"
  applySecret("ADMIN"),
  // Tenant Gateway Secret, "*.burning.boats"
  applySecret("TENANT"),
])
  .then(() => {
    console.info("✅ Secrets applied");
  })
  // If there's an error, log it and exit with an error code to fail the job.
  .catch(e => {
    console.error(e);
    process.exit(1);
  });
