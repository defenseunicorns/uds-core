/**
 * Waypoint utility module for standardized waypoint operations
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { UDSPackage } from "../../crd";
import { Mode } from "../../crd/generated/package-v1alpha1";
// No logger needed in this utility module

// Constants for waypoint configuration
const WAYPOINT_SUFFIX = "-waypoint"; // Suffix for waypoint resource names

/**
 * Determines if a package should use ambient waypoint networking
 * @param pkg - The UDS package to check
 * @returns boolean indicating if ambient waypoint should be used
 */
export const shouldUseAmbientWaypoint = (pkg: UDSPackage): boolean => {
  // Check if package has ambient mode and authservice SSO
  return pkg.spec?.network?.serviceMesh?.mode === Mode.Ambient && hasAuthserviceSSO(pkg);
};

/**
 * Checks if a package has authservice SSO configuration
 * @param pkg - The UDS package to check
 * @returns boolean indicating if package has authservice SSO
 * @remarks Returns true if enableAuthserviceSelector exists (even if empty object), false otherwise
 */
export const hasAuthserviceSSO = (pkg: UDSPackage): boolean =>
  pkg.spec?.sso?.some(s => s.enableAuthserviceSelector !== undefined) || false;

/**
 * Generates a consistent waypoint name from an ID
 * @param id - The base ID to generate the name from
 * @returns Formatted waypoint name
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
 * @param pkg - The UDS package
 * @param selector - The default pod selector
 * @param waypointName - The name of the waypoint (if in ambient mode)
 * @returns The appropriate pod selector to use
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
 * Checks if a service's selector matches the given labels
 * @param svc - The service to check
 * @param selector - The label selector to match against
 * @returns boolean indicating if there's a match
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
 * @param labels - The pod labels to check
 * @param selector - The selector to match against
 * @returns boolean indicating if there's a match
 */
export function matchesLabels(
  labels: Record<string, string>,
  selector: Record<string, string>,
): boolean {
  return Object.entries(selector).every(([k, v]) => labels[k] === v);
}
