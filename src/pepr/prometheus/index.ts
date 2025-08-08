/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { Capability } from "pepr";
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

const log = setupLogger(Component.PROMETHEUS);

export const prometheus = new Capability({
  name: "prometheus",
  description: "UDS Core Capability for the Prometheus stack.",
});

const { When } = prometheus;

/**
 * Mutate a ServiceMonitor resource by applying UDS conventions.
 *
 * ServiceMonitor mutation logic:
 * - If a custom scrapeClass is set (neither "istio-certs" nor "exempt"), update fallback only.
 * - Else if skip conditions apply (skip annotations or scrapeClass is "exempt"),simply remove scrapeClass.
 * - Otherwise (assumed "istio-certs"), remove scrapeClass, delete any TLS config, and set endpoints to HTTP.
 *
 * @param sm The ServiceMonitor to mutate
 */
export async function mutateServiceMonitor(sm: PrometheusServiceMonitor): Promise<void> {
  // Always set fallbackScrapeProtocol if missing.
  if (!sm.Raw.spec!.fallbackScrapeProtocol) {
    sm.Raw.spec!.fallbackScrapeProtocol = FallbackScrapeProtocol.PrometheusText004;
    log.info(`Set fallbackScrapeProtocol for ServiceMonitor ${sm.Raw.metadata?.name}`);
  }

  const sc = sm.Raw.spec!.scrapeClass;
  if (sc !== undefined && sc !== "istio-certs" && sc !== "exempt") {
    // Custom scrapeClass; do nothing else.
    log.info(
      `ServiceMonitor ${sm.Raw.metadata?.name} uses custom scrapeClass (${sc}); skipping endpoint mutation.`,
    );
    return;
  }

  // Skip conditions: skip annotations, or already "exempt".
  if (
    sm.Raw.metadata?.annotations?.["uds/skip-mutate"] ||
    sm.Raw.metadata?.annotations?.["uds/skip-sm-mutate"] ||
    sc === "exempt"
  ) {
    log.info(
      `ServiceMonitor ${sm.Raw.metadata?.name} meets skip conditions; clearing scrapeClass.`,
    );
    delete sm.Raw.spec!.scrapeClass;
    return;
  }

  // Default case: presumed "istio-certs"
  log.info(
    `Patching ServiceMonitor ${sm.Raw.metadata?.name}: clearing scrapeClass, setting endpoints to HTTP, and removing TLS config.`,
  );
  delete sm.Raw.spec!.scrapeClass; // always remove scrapeClass
  if (sm.Raw.spec?.endpoints && Array.isArray(sm.Raw.spec.endpoints)) {
    sm.Raw.spec.endpoints.forEach((endpoint: ServiceMonitorEndpoint) => {
      const tls = endpoint.tlsConfig;
      const isIstioTLS =
        tls?.caFile === "/etc/prom-certs/root-cert.pem" &&
        tls?.certFile === "/etc/prom-certs/cert-chain.pem" &&
        tls?.keyFile === "/etc/prom-certs/key.pem";

      // If this is the Istio TLS configuration, remove it and set scheme to HTTP.
      if (isIstioTLS) {
        delete endpoint.tlsConfig;
        endpoint.scheme = ServiceMonitorScheme.HTTP;
      }
    });
  }
}

When(PrometheusServiceMonitor)
  .IsCreatedOrUpdated()
  .Mutate(async sm => await mutateServiceMonitor(sm));

/**
 * Mutate a PodMonitor resource by applying UDS conventions.
 *
 * PodMonitor mutation logic:
 * - If a custom scrapeClass is set (not "istio-certs" or "exempt"), update fallback only.
 * - Else if skip conditions apply (skip annotations, or scrapeClass is "exempt"),
 *   remove scrapeClass.
 * - Otherwise, remove scrapeClass, and set endpoints to HTTP.
 *
 * @param pm The PodMonitor to mutate
 */
export async function mutatePodMonitor(pm: PrometheusPodMonitor): Promise<void> {
  if (!pm.Raw.spec!.fallbackScrapeProtocol) {
    pm.Raw.spec!.fallbackScrapeProtocol = FallbackScrapeProtocol.PrometheusText004;
    log.info(`Set fallbackScrapeProtocol for PodMonitor ${pm.Raw.metadata?.name}`);
  }

  const sc = pm.Raw.spec!.scrapeClass;
  if (sc !== undefined && sc !== "istio-certs" && sc !== "exempt") {
    log.info(
      `PodMonitor ${pm.Raw.metadata?.name} uses custom scrapeClass (${sc}); skipping mutation.`,
    );
    return;
  }

  // Skip conditions: skip annotations, or already "exempt".
  if (
    pm.Raw.metadata?.annotations?.["uds/skip-mutate"] ||
    pm.Raw.metadata?.annotations?.["uds/skip-pm-mutate"] ||
    sc === "exempt"
  ) {
    log.info(`PodMonitor ${pm.Raw.metadata?.name} meets skip conditions; clearing scrapeClass.`);
    delete pm.Raw.spec!.scrapeClass;
    return;
  }

  log.info(
    `Patching PodMonitor ${pm.Raw.metadata?.name}: clearing scrapeClass, setting endpoints to HTTP.`,
  );
  delete pm.Raw.spec!.scrapeClass;
  if (pm.Raw.spec?.podMetricsEndpoints && Array.isArray(pm.Raw.spec.podMetricsEndpoints)) {
    pm.Raw.spec.podMetricsEndpoints.forEach((endpoint: PodMonitorEndpoint) => {
      endpoint.scheme = PodMonitorScheme.HTTP;
    });
  }
}

When(PrometheusPodMonitor)
  .IsCreatedOrUpdated()
  .Mutate(async pm => await mutatePodMonitor(pm));
