/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { Capability, K8s, kind } from "pepr";
import { Component, setupLogger } from "../logger";
import {
  PodMonitorEndpoint,
  PodMonitorScheme,
  PrometheusPodMonitor,
  PrometheusServiceMonitor,
  ServiceMonitorEndpoint,
  ServiceMonitorScheme,
} from "../operator/crd";
import { FallbackScrapeProtocol } from "../operator/crd/generated/prometheus/servicemonitor-v1";
// configure subproject logger
const log = setupLogger(Component.PROMETHEUS);

export const prometheus = new Capability({
  name: "prometheus",
  description: "UDS Core Capability for the Prometheus stack.",
});

const { When } = prometheus;

/**
 * Mutate a service monitor to exclude it from mTLS metrics with `exempt` scrapeClass
 */
When(PrometheusServiceMonitor)
  .IsCreatedOrUpdated()
  .Mutate(async sm => {
    if (sm.Raw.spec === undefined || sm.Raw.spec.scrapeClass !== undefined) {
      // Support the legacy (Prometheus 2.x fallback) until upstream applications properly handle protocol
      if (sm.Raw.spec && !sm.Raw.spec.fallbackScrapeProtocol) {
        sm.Raw.spec.fallbackScrapeProtocol = FallbackScrapeProtocol.PrometheusText004;
      }
      return;
    }

    // Add an exempt scrape class if explicitly opted out via annotation OR targeting a non-istio-injected namespace
    if (
      sm.Raw.metadata?.annotations?.["uds/skip-mutate"] ||
      sm.Raw.metadata?.annotations?.["uds/skip-sm-mutate"] ||
      !(await isIstioInjected(sm))
    ) {
      log.info(
        `Mutating scrapeClass to exempt ServiceMonitor ${sm.Raw.metadata?.name} from default scrapeClass mTLS config`,
      );
      sm.Raw.spec.scrapeClass = "exempt";
      // Support the legacy (Prometheus 2.x fallback) until upstream applications properly handle protocol
      if (!sm.Raw.spec.fallbackScrapeProtocol) {
        sm.Raw.spec.fallbackScrapeProtocol = FallbackScrapeProtocol.PrometheusText004;
      }

      return;
    } else {
      log.info(`Patching service monitor ${sm.Raw.metadata?.name} for mTLS metrics`);
      // Note: this tlsConfig patch is deprecated in favor of a default scrape class for both service and pod monitors
      const tlsConfig = {
        caFile: "/etc/prom-certs/root-cert.pem",
        certFile: "/etc/prom-certs/cert-chain.pem",
        keyFile: "/etc/prom-certs/key.pem",
        insecureSkipVerify: true,
      };
      const endpoints: ServiceMonitorEndpoint[] = sm.Raw.spec.endpoints || [];
      endpoints.forEach(endpoint => {
        endpoint.scheme = ServiceMonitorScheme.HTTPS;
        endpoint.tlsConfig = tlsConfig;
      });
      sm.Raw.spec.endpoints = endpoints;
      // Support the legacy (Prometheus 2.x fallback) until upstream applications properly handle protocol
      if (!sm.Raw.spec.fallbackScrapeProtocol) {
        sm.Raw.spec.fallbackScrapeProtocol = FallbackScrapeProtocol.PrometheusText004;
      }
    }
  });

/**
 * Mutate a pod monitor to exclude it from mTLS metrics with `exempt` scrapeClass
 */
When(PrometheusPodMonitor)
  .IsCreatedOrUpdated()
  .Mutate(async pm => {
    if (pm.Raw.spec === undefined || pm.Raw.spec.scrapeClass !== undefined) {
      // Support the legacy (Prometheus 2.x fallback) until upstream applications properly handle protocol
      if (pm.Raw.spec && !pm.Raw.spec.fallbackScrapeProtocol) {
        pm.Raw.spec.fallbackScrapeProtocol = FallbackScrapeProtocol.PrometheusText004;
      }
      return;
    }

    // Add an exempt scrape class if explicitly opted out via annotation OR targeting a non-istio-injected namespace
    if (pm.Raw.metadata?.annotations?.["uds/skip-mutate"] || !(await isIstioInjected(pm))) {
      log.info(
        `Mutating scrapeClass to exempt PodMonitor ${pm.Raw.metadata?.name} from default scrapeClass mTLS config`,
      );
      pm.Raw.spec.scrapeClass = "exempt";
      // Support the legacy (Prometheus 2.x fallback) until upstream applications properly handle protocol
      if (!pm.Raw.spec.fallbackScrapeProtocol) {
        pm.Raw.spec.fallbackScrapeProtocol = FallbackScrapeProtocol.PrometheusText004;
      }

      return;
    } else {
      log.info(`Patching pod monitor ${pm.Raw.metadata?.name} for mTLS metrics`);
      const endpoints: PodMonitorEndpoint[] = pm.Raw.spec.podMetricsEndpoints || [];
      endpoints.forEach(endpoint => {
        endpoint.scheme = PodMonitorScheme.HTTPS;
      });
      pm.Raw.spec.podMetricsEndpoints = endpoints;
      // Support the legacy (Prometheus 2.x fallback) until upstream applications properly handle protocol
      if (!pm.Raw.spec.fallbackScrapeProtocol) {
        pm.Raw.spec.fallbackScrapeProtocol = FallbackScrapeProtocol.PrometheusText004;
      }
    }
  });

// This assumes istio-injection === strict mTLS due to complexity around mTLS lookup
async function isIstioInjected(monitor: PrometheusServiceMonitor | PrometheusPodMonitor) {
  // If monitor allows any namespace assume istio injection
  if (monitor.Raw.spec?.namespaceSelector?.any) {
    return true;
  }

  const namespaces = monitor.Raw.spec?.namespaceSelector?.matchNames || [
      monitor.Raw.metadata?.namespace,
    ] || ["default"];

  for (const ns of namespaces) {
    const namespace = await K8s(kind.Namespace).Get(ns);
    if (namespace.metadata?.labels && namespace.metadata.labels["istio-injection"] === "enabled") {
      return true;
    }
  }

  return false;
}
