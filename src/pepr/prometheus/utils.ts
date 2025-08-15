/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s, kind } from "pepr";
import { PrometheusPodMonitor, PrometheusServiceMonitor } from "../operator/crd";

/**
 * Returns true if any namespace selected has "istio-injection" enabled.
 */
export async function isIstioInjected(
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
