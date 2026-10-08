/**
 * Waypoint utility module for standardized waypoint operations
 * Copyright 2024-2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { UDSPackage } from "../../crd";
import { Mode } from "../../crd/generated/package-v1alpha1";

// Constants for waypoint configuration
const WAYPOINT_SUFFIX = "-waypoint"; // Suffix for waypoint resource names

export interface WaypointTarget {
  id: string;
  selector: Record<string, string>;
  type: "authservice" | "external-authorization";
}

/**
 * Returns each workload selector that requires an ambient waypoint.
 */
export const getWaypointTargets = (pkg: UDSPackage): WaypointTarget[] => {
  const targets: WaypointTarget[] =
    pkg.spec?.sso
      ?.filter(
        sso =>
          sso.enableAuthserviceSelector !== undefined && sso.enableAuthserviceSelector !== null,
      )
      .map(sso => ({
        id: sso.clientId,
        selector: sso.enableAuthserviceSelector ?? {},
        type: "authservice",
      })) ?? [];

  const externalAuthorization = pkg.spec?.network?.serviceMesh?.externalAuthorization;
  if (externalAuthorization && pkg.metadata?.name) {
    targets.push({
      id: pkg.metadata.name,
      selector: externalAuthorization.selector,
      type: "external-authorization",
    });
  }

  return targets;
};

/**
 * Finds the first ambient waypoint target whose selector matches the supplied labels.
 */
export const findMatchingWaypointTarget = (
  pkg: UDSPackage,
  labels: Record<string, string> | undefined,
): WaypointTarget | undefined => {
  const istioMode = pkg.spec?.network?.serviceMesh?.mode || Mode.Ambient;
  if (!labels || istioMode !== Mode.Ambient) return undefined;

  return getWaypointTargets(pkg).find(target =>
    Object.entries(target.selector).every(([key, value]) => labels[key] === value),
  );
};

/**
 * Determines if a package should use ambient waypoint networking
 */
export const shouldUseAmbientWaypoint = (pkg: UDSPackage): boolean => {
  const istioMode = pkg.spec?.network?.serviceMesh?.mode || Mode.Ambient;
  return istioMode === Mode.Ambient && getWaypointTargets(pkg).length > 0;
};

/**
 * Checks if a package has authservice SSO configuration
 */
export const hasAuthserviceSSO = (pkg: UDSPackage): boolean =>
  pkg.spec?.sso?.some(s => s.enableAuthserviceSelector !== undefined) || false;

/**
 * Generates a consistent waypoint name from an ID
 */
export const getWaypointName = (id: string): string => {
  // Validate input
  if (!id || id.trim() === "") {
    throw new Error("Waypoint ID cannot be empty");
  }

  // Generate standardized name
  let waypointName = id;

  // Don't add the suffix if it already exists
  if (!waypointName.endsWith(WAYPOINT_SUFFIX)) {
    waypointName = `${waypointName}${WAYPOINT_SUFFIX}`;
  }

  return waypointName;
};

/**
 * Gets the appropriate pod selector based on whether ambient waypoint is enabled
 */
export function getPodSelector(
  pkg: UDSPackage,
  selector: Record<string, string>,
  waypointName: string,
): Record<string, string> {
  if (shouldUseAmbientWaypoint(pkg)) {
    return { "istio.io/gateway-name": waypointName };
  }
  return selector;
}

/**
 * Checks if a service's spec.selector matches the given selector
 */
export function serviceMatchesSelector(
  svc: { spec?: { selector?: Record<string, string> } },
  selector: Record<string, string>,
): boolean {
  const svcSelector = svc.spec?.selector || {};
  return Object.entries(selector).every(([k, v]) => svcSelector[k] === v);
}

/**
 * Checks if pod labels match a selector
 */
export function matchesLabels(
  labels: Record<string, string>,
  selector: Record<string, string>,
): boolean {
  return Object.entries(selector).every(([k, v]) => labels[k] === v);
}
