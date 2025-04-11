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

const log = setupLogger(Component.PROMETHEUS);

export const prometheus = new Capability({
  name: "prometheus",
  description: "UDS Core Capability for the Prometheus stack.",
});

const { When } = prometheus;

/**
 * Returns true if any namespace selected has "istio-injection" enabled.
 */
async function isIstioInjected(
  monitor: PrometheusServiceMonitor | PrometheusPodMonitor,
): Promise<boolean> {
  if (monitor.Raw.spec?.namespaceSelector?.any) return true;
  const namespaces = monitor.Raw.spec?.namespaceSelector?.matchNames || [
      monitor.Raw.metadata?.namespace,
    ] || ["default"];
  for (const ns of namespaces) {
    const namespace = await K8s(kind.Namespace).Get(ns);
    if (namespace.metadata?.labels?.["istio-injection"] === "enabled") {
      return true;
    }
  }
  return false;
}

/**
 * ServiceMonitor mutation logic:
 * - If a custom scrapeClass is set (neither "istio-certs" nor "exempt"), update fallback only.
 * - Else if skip conditions apply (skip annotations, not istio-injected, or scrapeClass is "exempt"),
 *   simply remove scrapeClass.
 * - Otherwise (assumed "istio-certs"), remove scrapeClass, delete any TLS config, and set endpoints to HTTP.
 */
When(PrometheusServiceMonitor)
  .IsCreatedOrUpdated()
  .Mutate(async sm => {
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

    // Skip conditions: skip annotations, not istio-injected, or already "exempt".
    if (
      sm.Raw.metadata?.annotations?.["uds/skip-mutate"] ||
      sm.Raw.metadata?.annotations?.["uds/skip-sm-mutate"] ||
      !(await isIstioInjected(sm)) ||
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
    delete sm.Raw.spec!.scrapeClass;
    if (sm.Raw.spec?.endpoints && Array.isArray(sm.Raw.spec.endpoints)) {
      sm.Raw.spec.endpoints.forEach((endpoint: ServiceMonitorEndpoint) => {
        endpoint.scheme = ServiceMonitorScheme.HTTP;
        if (endpoint.tlsConfig) {
          delete endpoint.tlsConfig;
        }
      });
    }
  });

/**
 * PodMonitor mutation logic:
 * - If a custom scrapeClass is set (not "istio-certs" or "exempt"), update fallback only.
 * - Else if skip conditions apply (skip annotations, not istio-injected, or scrapeClass is "exempt"),
 *   remove scrapeClass.
 * - Otherwise, remove scrapeClass, delete TLS config from podMetricsEndpoints, and set endpoints to HTTP.
 */
When(PrometheusPodMonitor)
  .IsCreatedOrUpdated()
  .Mutate(async pm => {
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

    if (
      pm.Raw.metadata?.annotations?.["uds/skip-mutate"] ||
      !(await isIstioInjected(pm)) ||
      sc === "exempt"
    ) {
      log.info(`PodMonitor ${pm.Raw.metadata?.name} meets skip conditions; clearing scrapeClass.`);
      delete pm.Raw.spec!.scrapeClass;
      return;
    }

    log.info(
      `Patching PodMonitor ${pm.Raw.metadata?.name}: clearing scrapeClass, setting endpoints to HTTP, and removing TLS config.`,
    );
    delete pm.Raw.spec!.scrapeClass;
    if (pm.Raw.spec?.podMetricsEndpoints && Array.isArray(pm.Raw.spec.podMetricsEndpoints)) {
      pm.Raw.spec.podMetricsEndpoints.forEach((endpoint: PodMonitorEndpoint) => {
        endpoint.scheme = PodMonitorScheme.HTTP;
        if (endpoint.tlsConfig) {
          delete endpoint.tlsConfig;
        }
      });
    }
  });
