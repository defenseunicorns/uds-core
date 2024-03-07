import { Capability, K8s, Log, kind } from "pepr";
import { Prometheus } from "../operator/crd";

export const prometheus = new Capability({
  name: "prometheus",
  description: "UDS Core Capability for the Prometheus stack.",
});

const { When } = prometheus;

// todo: should we even do this?
/**
 * Mutate a service monitor to enable mTLS metrics
 *
 */
When(Prometheus.ServiceMonitor)
  .IsCreatedOrUpdated()
  .Mutate(async sm => {
    const namespaces = sm.Raw.spec?.namespaceSelector?.matchNames || [sm.Raw.metadata?.namespace];
    let istioInjected = false;

    for (const ns of namespaces) {
      if (ns === undefined) {
        return;
      }
      const namespace = await K8s(kind.Namespace).Get(ns);
      if (
        namespace.metadata?.labels &&
        namespace.metadata.labels["istio-injection"] === "enabled"
      ) {
        istioInjected = true;
      }
    }

    // todo: should we just assume istio injection?
    // todo: making an assumption about STRICT mTLS here, should we try to check that?
    if (istioInjected) {
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
