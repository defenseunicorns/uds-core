/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { Capability } from "pepr";
import { Component, setupLogger } from "../logger.js";
import { FallbackScrapeProtocol } from "../operator/crd/generated/prometheus/servicemonitor-v1.js";
import { PrometheusPodMonitor, PrometheusServiceMonitor } from "../operator/crd/index.js";

const log = setupLogger(Component.PROMETHEUS);

export const prometheus = new Capability({
  name: "prometheus",
  description: "UDS Core Capability for the Prometheus stack.",
});

const { When } = prometheus;

/**
 * Mutate a ServiceMonitor resource to add a fallbackScrapeProtocol of PrometheusText0.0.4
 * This maintains backwards compatibility with Prometheus 2.x to support UDS Packages.
 *
 * @param sm The ServiceMonitor to mutate
 */
export async function mutateServiceMonitor(sm: PrometheusServiceMonitor): Promise<void> {
  // Always set fallbackScrapeProtocol if missing.
  if (!sm.Raw.spec!.fallbackScrapeProtocol) {
    sm.Raw.spec!.fallbackScrapeProtocol = FallbackScrapeProtocol.PrometheusText004;
    log.info(`Set fallbackScrapeProtocol for ServiceMonitor ${sm.Raw.metadata?.name}`);
  }
}

When(PrometheusServiceMonitor)
  .IsCreatedOrUpdated()
  .Mutate(async sm => await mutateServiceMonitor(sm));

/**
 * Mutate a PodMonitor resource to add a fallbackScrapeProtocol of PrometheusText0.0.4
 * This maintains backwards compatibility with Prometheus 2.x to support UDS Packages.
 *
 * @param pm The PodMonitor to mutate
 */
export async function mutatePodMonitor(pm: PrometheusPodMonitor): Promise<void> {
  if (!pm.Raw.spec!.fallbackScrapeProtocol) {
    pm.Raw.spec!.fallbackScrapeProtocol = FallbackScrapeProtocol.PrometheusText004;
    log.info(`Set fallbackScrapeProtocol for PodMonitor ${pm.Raw.metadata?.name}`);
  }
}

When(PrometheusPodMonitor)
  .IsCreatedOrUpdated()
  .Mutate(async pm => await mutatePodMonitor(pm));
