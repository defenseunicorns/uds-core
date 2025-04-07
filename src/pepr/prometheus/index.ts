/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { Capability } from "pepr";
import { Component, setupLogger } from "../logger";
import { PrometheusPodMonitor, PrometheusServiceMonitor } from "../operator/crd";
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
    log.info(
      `Mutating scrapeClass to exempt ServiceMonitor ${sm.Raw.metadata?.name} from default scrapeClass mTLS config`,
    );

    // Always force the exempt scrape class in ambient mode.
    sm.Raw.spec!.scrapeClass = "exempt";
    if (!sm.Raw.spec!.fallbackScrapeProtocol) {
      // Support the legacy (Prometheus 2.x fallback) until upstream applications properly handle protocol
      sm.Raw.spec!.fallbackScrapeProtocol = FallbackScrapeProtocol.PrometheusText004;
    }
  });

/**
 * Mutate a pod monitor to exclude it from mTLS metrics with `exempt` scrapeClass
 */
When(PrometheusPodMonitor)
  .IsCreatedOrUpdated()
  .Mutate(async pm => {
    log.info(
      `Mutating scrapeClass to exempt PodMonitor ${pm.Raw.metadata?.name} from default scrapeClass mTLS config`,
    );

    // Always force the exempt scrape class in ambient mode.
    pm.Raw.spec!.scrapeClass = "exempt";
    if (!pm.Raw.spec!.fallbackScrapeProtocol) {
      // Support the legacy (Prometheus 2.x fallback) until upstream applications properly handle protocol
      pm.Raw.spec!.fallbackScrapeProtocol = FallbackScrapeProtocol.PrometheusText004;
    }
  });
