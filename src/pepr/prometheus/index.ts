import { Capability, K8s, kind, Log } from "pepr";
import { Prometheus } from "../operator/crd";

export const prometheus = new Capability({
  name: "prometheus",
  description: "UDS Core Capability for the Prometheus stack.",
});

const { When } = prometheus;

/**
 * Mutate a service monitor to enable mTLS metrics
 */
When(Prometheus.ServiceMonitor)
  .IsCreatedOrUpdated()
  .Mutate(async sm => {
    // Provide an opt-out of mutation to handle complicated scenarios
    if (sm.Raw.metadata?.annotations?.["uds/skip-sm-mutate"]) {
      return;
    }

    // This assumes istio-injection == strict mTLS due to complexity around mTLS lookup
    if (await isIstioInjected(sm)) {
      if (sm.Raw.spec?.endpoints === undefined) {
        return;
      }

      Log.info(`Patching service monitor ${sm.Raw.metadata?.name} for mTLS metrics`);
      const tlsConfig = {
        caFile: "/etc/prom-certs/root-cert.pem",
        certFile: "/etc/prom-certs/cert-chain.pem",
        keyFile: "/etc/prom-certs/key.pem",
        insecureSkipVerify: true,
      };
      const endpoints: Prometheus.Endpoint[] = sm.Raw.spec.endpoints;
      endpoints.forEach(endpoint => {
        endpoint.scheme = Prometheus.Scheme.HTTPS;
        endpoint.tlsConfig = tlsConfig;
      });
      sm.Raw.spec.endpoints = endpoints;
    } else {
      Log.info(`No mutations needed for service monitor ${sm.Raw.metadata?.name}`);
    }
  });

async function isIstioInjected(sm: Prometheus.ServiceMonitor) {
  const namespaces = sm.Raw.spec?.namespaceSelector?.matchNames || [sm.Raw.metadata?.namespace] || [
      "default",
    ];

  for (const ns of namespaces) {
    const namespace = await K8s(kind.Namespace).Get(ns);
    if (namespace.metadata?.labels && namespace.metadata.labels["istio-injection"] === "enabled") {
      return true;
    }
  }
  return false;
}
