/**
 * Waypoint utility module for standardized waypoint operations
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { Mode } from "../../crd/generated/package-v1alpha1.js";
import { UDSPackage } from "../../crd/index.js";

// Constants for waypoint configuration
const WAYPOINT_SUFFIX = "-waypoint"; // Suffix for waypoint resource names

/**
 * Determines if a package should use ambient waypoint networking
 */
export const shouldUseAmbientWaypoint = (pkg: UDSPackage): boolean => {
  const istioMode = pkg.spec?.network?.serviceMesh?.mode || Mode.Ambient;
  return istioMode === Mode.Ambient && hasAuthserviceSSO(pkg);
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
