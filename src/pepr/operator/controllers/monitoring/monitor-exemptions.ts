/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */
import { Monitor, UDSPackage } from "../../crd";
import { To } from "../../crd/generated/istio/authorizationpolicy-v1";
import { getWaypointName, matchesLabels, shouldUseAmbientWaypoint } from "../istio/waypoint-utils";
import { getAuthserviceClients } from "../utils";

export interface MonitorExemption {
  port?: string;
  path?: string;
}

export function computeMonitorExemptions(
  pkg: UDSPackage,
  selector: Record<string, string>,
  hostAuth = false,
): MonitorExemption[] {
  return (pkg.spec?.monitor ?? [])
    .filter(m => monitorMatches(m.podSelector ?? m.selector, selector, hostAuth))
    .map(m => ({ port: String(m.targetPort), path: m.path || "/metrics" }));
}

function monitorMatches(
  monitor: Monitor["selector"],
  workload: Monitor["selector"],
  hostAuth: boolean,
) {
  return matchesLabels(monitor, workload) || (hostAuth && matchesLabels(workload, monitor));
}

export function monitorWaypoints(
  pkg: UDSPackage,
  monitor: Monitor,
  legacySelector = monitor.podSelector ?? monitor.selector,
): (string | undefined)[] {
  if (!shouldUseAmbientWaypoint(pkg)) return [undefined];
  const selector = monitor.podSelector ?? monitor.selector;
  const clients = getAuthserviceClients(pkg);
  const legacy = clients.find(
    sso => !sso.authservice && matchesLabels(legacySelector, sso.enableAuthserviceSelector!),
  );
  const hosts = clients.filter(
    sso => sso.authservice && monitorMatches(selector, sso.enableAuthserviceSelector!, true),
  );
  const waypoints = hosts.map(sso => getWaypointName(sso.clientId));
  if (legacy) return [getWaypointName(legacy.clientId), ...waypoints];
  // A broader monitor can also scrape pods outside every protected workload.
  return hosts.some(sso => matchesLabels(selector, sso.enableAuthserviceSelector!))
    ? waypoints
    : [undefined, ...waypoints];
}

export function buildMonitorOperations(exemptions: MonitorExemption[]) {
  const pathsByPort = new Map<string, Set<string>>();
  for (const { port, path } of exemptions) {
    if (!port) continue;
    const paths = pathsByPort.get(port) ?? new Set<string>();
    if (path) paths.add(path);
    pathsByPort.set(port, paths);
  }
  const metrics: To[] = [];
  const nonMetrics: To[] = [];
  for (const [port, paths] of pathsByPort) {
    const endpoints = paths.size ? [...paths] : ["/metrics"];
    metrics.push({ operation: { ports: [port], paths: endpoints } });
    nonMetrics.push({ operation: { ports: [port], notPaths: endpoints } });
  }
  if (pathsByPort.size) nonMetrics.push({ operation: { notPorts: [...pathsByPort.keys()] } });
  return { metrics, nonMetrics };
}
