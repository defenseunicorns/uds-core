import { Capability, K8s, kind } from "pepr";
import { Component, setupLogger } from "../logger";
import {
  PrometheusServiceMonitor,
  ServiceMonitorEndpoint,
  ServiceMonitorScheme,
} from "../operator/crd";

// configure subproject logger
const log = setupLogger(Component.PROMETHEUS);

export const prometheus = new Capability({
  name: "prometheus",
  description: "UDS Core Capability for the Prometheus stack.",
});

const { When } = prometheus;

/**
 * Mutate a service monitor to enable mTLS metrics
 */
When(PrometheusServiceMonitor)
  .IsCreatedOrUpdated()
  .Mutate(async sm => {
    // Provide an opt-out of mutation to handle complicated scenarios
    if (sm.Raw.metadata?.annotations?.["uds/skip-sm-mutate"]) {
      log.info(
        `Mutating scrapeClass to exempt ServiceMonitor ${sm.Raw.metadata?.name} from default scrapeClass mTLS config`,
      );
      if (sm.Raw.spec === undefined) {
        return;
      }
      sm.Raw.spec.scrapeClass = "exempt";
      return;
    }

    // This assumes istio-injection == strict mTLS due to complexity around mTLS lookup
    if (await isIstioInjected(sm)) {
      if (sm.Raw.spec?.endpoints === undefined) {
        return;
      }
      /**
       * Patching ServiceMonitor tlsConfig is deprecated in favor of default scrapeClass with tls config
       * this mutation will be removed in favor of a mutation to opt-out of the default scrapeClass in the future
       */
      log.info(`Patching service monitor ${sm.Raw.metadata?.name} for mTLS metrics`);
      const tlsConfig = {
        caFile: "/etc/prom-certs/root-cert.pem",
        certFile: "/etc/prom-certs/cert-chain.pem",
        keyFile: "/etc/prom-certs/key.pem",
        insecureSkipVerify: true,
      };
      const endpoints: ServiceMonitorEndpoint[] = sm.Raw.spec.endpoints;
      endpoints.forEach(endpoint => {
        endpoint.scheme = ServiceMonitorScheme.HTTPS;
        endpoint.tlsConfig = tlsConfig;
      });
      sm.Raw.spec.endpoints = endpoints;
    } else {
      log.info(
        `Mutating scrapeClass to exempt ServiceMonitor ${sm.Raw.metadata?.name} from default scrapeClass mTLS config`,
      );
      if (sm.Raw.spec === undefined) {
        return;
      }
      sm.Raw.spec.scrapeClass = "exempt";
    }
  });

async function isIstioInjected(sm: PrometheusServiceMonitor) {
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
