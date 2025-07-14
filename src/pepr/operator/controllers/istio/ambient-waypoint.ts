/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { V1LabelSelector, V1NetworkPolicySpec } from "@kubernetes/client-node";
import { a, K8s } from "pepr";
import { K8sGateway, UDSPackage } from "../../crd";
import { PackageStore } from "../packages/package-store";
import { getOwnerRef } from "../utils";
import { log } from "./istio-resources";

// Constants for labels and configuration
const WAYPOINT_SUFFIX = "-waypoint"; // Suffix for waypoint resource names
const ISTIO_WAYPOINT_LABEL = "istio.io/use-waypoint"; // Label to enable waypoint injection
const UDS_MANAGED_LABEL = "uds/managed-by"; // Label to identify UDS-managed resources

// Environment variables with defaults for waypoint health checking
const HEALTH_OPTS = {
  maxAttempts: parseInt(process.env.WAYPOINT_HEALTH_MAX_ATTEMPTS || "10", 10),
  intervalMs: parseInt(process.env.WAYPOINT_HEALTH_INTERVAL_MS || "5000", 10),
  timeoutMs: parseInt(process.env.WAYPOINT_HEALTH_TIMEOUT_MS || "60000", 10),
};

/**
 * Checks if a package has SSO configured with enableAuthserviceSelector
 * @param pkg - The UDS package to check
 * @returns boolean indicating if SSO is configured
 */
export const hasAuthserviceSSO = (pkg?: UDSPackage): boolean =>
  pkg?.spec?.sso?.some(s => !!s.enableAuthserviceSelector) || false;

/**
 * Determines if a package should use ambient waypoint networking
 * @param pkg - The UDS package to check
 * @returns boolean indicating if ambient waypoint should be used
 */
export const shouldUseAmbientWaypoint = (pkg?: UDSPackage): boolean =>
  pkg?.spec?.network?.serviceMesh?.mode === "ambient" && hasAuthserviceSSO(pkg);

/**
 * Generates a consistent waypoint name from an ID
 * @param id - The base ID to generate the name from
 * @returns Formatted waypoint name
 */
export const getWaypointName = (id: string): string =>
  `${id.startsWith("uds-core-") ? "" : "uds-core-"}${id}${WAYPOINT_SUFFIX}`;

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
 * Network Policy Helper: Creates a network policy object
 * @param name - Name of the network policy
 * @param namespace - Namespace for the policy
 * @param pkg - The owning UDS package
 * @param spec - Network policy spec
 * @returns Network policy object
 */
export const createNetworkPolicy = (
  name: string,
  namespace: string,
  pkg: UDSPackage,
  spec: V1NetworkPolicySpec,
) => ({
  apiVersion: "networking.k8s.io/v1",
  kind: "NetworkPolicy",
  metadata: {
    name,
    namespace,
    labels: { [UDS_MANAGED_LABEL]: "uds-operator" },
    ownerReferences: getOwnerRef(pkg),
  },
  spec,
});

/**
 * Sets up an ambient waypoint for a package
 * @param pkg - The package to set up the waypoint for
 * @param waypointId - The ID of the waypoint to set up
 * @throws Error if setup fails
 */
export async function setupAmbientWaypoint(pkg: UDSPackage, waypointId: string): Promise<void> {
  const { namespace, name } = pkg.metadata || {};
  if (!namespace || !name) throw new Error("Package metadata is missing namespace or name");

  const waypointName = getWaypointName(waypointId);
  log.info("Starting ambient waypoint setup", { namespace, package: name, waypointName });

  try {
    await createWaypointGateway(pkg, waypointId);
    await waitForWaypointPodHealthy(namespace, waypointName);

    const appSelector = pkg.spec?.sso?.find(
      s => s.enableAuthserviceSelector,
    )?.enableAuthserviceSelector;
    if (appSelector) {
      await generateWaypointNetworkPolicies(pkg, waypointName, appSelector);
    }

    log.info("Successfully set up ambient waypoint", { namespace, package: name, waypointName });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error("Failed to set up ambient waypoint", {
      namespace,
      package: name,
      waypointName,
      error: errorMessage,
    });
    throw new Error(`Failed to set up ambient waypoint: ${errorMessage}`);
  }
}

/**
 * Creates a waypoint gateway for the given package
 * @param pkg - The UDS package
 * @param waypointId - The ID for the waypoint
 * @returns Promise resolving to the waypoint name
 */
export async function createWaypointGateway(pkg: UDSPackage, waypointId: string) {
  const { namespace, name } = pkg.metadata || {};
  if (!namespace || !name) throw new Error("Package metadata is missing namespace or name");

  const waypointName = getWaypointName(waypointId);
  log.info(`Creating waypoint gateway for package: ${namespace}/${name}`, { waypointName });

  const gateway = new K8sGateway();

  gateway.metadata = {
    name: waypointName,
    namespace,
    labels: {
      [UDS_MANAGED_LABEL]: "uds-operator",
      "app.kubernetes.io/component": "ambient-waypoint",
      "istio.io/waypoint-for": "all",
      "istio.io/gateway-name": waypointName,
    },
    ownerReferences: getOwnerRef(pkg),
  };

  gateway.spec = {
    gatewayClassName: "istio-waypoint",
    listeners: [{ name: "mesh", port: 15008, protocol: "HBONE" }],
  };

  await K8s(K8sGateway).Apply(gateway, { force: true });
  return waypointName;
}

/**
 * Generates and applies network policies for waypoint-to-application communication
 * @param pkg - The UDS package
 * @param waypointName - Name of the waypoint
 * @param appSelector - Selector for the application pods
 */
export async function generateWaypointNetworkPolicies(
  pkg: UDSPackage,
  waypointName: string,
  appSelector: Record<string, string>,
) {
  const namespace = pkg.metadata?.namespace;
  if (!namespace || !pkg.metadata?.uid || !shouldUseAmbientWaypoint(pkg)) return;

  const waypointSelector: V1LabelSelector = {
    matchLabels: { "istio.io/gateway-name": waypointName },
  };
  const appSelectorObj: V1LabelSelector = { matchLabels: appSelector };

  const policies = [
    // Ingress policy: Allow traffic from app pods to waypoint
    createNetworkPolicy(`${waypointName}-ingress-from-app`, namespace, pkg, {
      podSelector: waypointSelector,
      ingress: [{ from: [{ podSelector: appSelectorObj }] }],
      policyTypes: ["Ingress"],
    }),
    // Egress policy: Allow traffic from waypoint to app pods
    createNetworkPolicy(`${waypointName}-egress-to-app`, namespace, pkg, {
      podSelector: waypointSelector,
      egress: [{ to: [{ podSelector: appSelectorObj }] }],
      policyTypes: ["Egress"],
    }),
  ];

  await Promise.all(policies.map(policy => K8s(a.NetworkPolicy).Apply(policy, { force: true })));
}

/**
 * Checks if a waypoint pod is healthy
 * @param namespace - Namespace of the pod
 * @param waypointName - Name of the waypoint
 * @returns Promise resolving to boolean indicating pod health
 */
export async function isWaypointPodHealthy(
  namespace: string,
  waypointName: string,
): Promise<boolean> {
  const pods = await K8s(a.Pod)
    .InNamespace(namespace)
    .WithLabel(`istio.io/gateway-name=${waypointName}`)
    .Get();

  return (
    pods.items?.some(
      pod =>
        pod.status?.phase === "Running" && pod.status?.containerStatuses?.every(cs => cs.ready),
    ) || false
  );
}

/**
 * Waits for a waypoint pod to become healthy with retries
 * @param namespace - Namespace of the pod
 * @param waypointName - Name of the waypoint
 * @throws Error if pod doesn't become healthy within timeout
 */
export async function waitForWaypointPodHealthy(
  namespace: string,
  waypointName: string,
): Promise<void> {
  const start = Date.now();
  const { maxAttempts, intervalMs, timeoutMs } = HEALTH_OPTS;

  for (let i = 1; i <= maxAttempts; i++) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`Timeout waiting for waypoint pod ${waypointName} in ${namespace}`);
    }

    if (await isWaypointPodHealthy(namespace, waypointName)) {
      return;
    }

    if (i < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
  }

  throw new Error(`Waypoint pod ${waypointName} in ${namespace} did not become healthy`);
}

/**
 * Reconciles a service to add waypoint labels
 * @param svc - The service to reconcile
 */
export async function reconcileService(svc: a.Service): Promise<void> {
  const namespace = svc.metadata?.namespace;
  if (!namespace || !svc.metadata?.labels) return;

  for (const pkg of PackageStore.getAmbientPackagesByNamespace(namespace)) {
    const waypointName = pkg.metadata?.name && getWaypointName(pkg.metadata.name);
    const selector = pkg.spec?.sso?.find(
      s => s.enableAuthserviceSelector,
    )?.enableAuthserviceSelector;

    if (waypointName && selector && serviceMatchesSelector(svc, selector)) {
      svc.metadata.labels = {
        ...svc.metadata.labels,
        [ISTIO_WAYPOINT_LABEL]: waypointName,
        "istio.io/ingress-use-waypoint": "true",
      };
      return;
    }
  }
}

/**
 * Reconciles a pod to add waypoint labels
 * @param pod - The pod to reconcile
 */
export async function reconcilePod(pod: a.Pod): Promise<void> {
  const namespace = pod.metadata?.namespace;
  if (!namespace || !pod.metadata?.labels) return;

  for (const pkg of PackageStore.getAmbientPackagesByNamespace(namespace)) {
    const waypointName = pkg.metadata?.name && getWaypointName(pkg.metadata.name);
    const selector = pkg.spec?.sso?.find(
      s => s.enableAuthserviceSelector,
    )?.enableAuthserviceSelector;

    if (waypointName && selector && matchesLabels(pod.metadata.labels, selector)) {
      pod.metadata.labels = {
        ...pod.metadata.labels,
        [ISTIO_WAYPOINT_LABEL]: waypointName,
      };
      return;
    }
  }
}

/**
 * Checks if a service's selector matches the given labels
 * @param svc - The service to check
 * @param selector - The label selector to match against
 * @returns boolean indicating if there's a match
 */
export function serviceMatchesSelector(svc: a.Service, selector: Record<string, string>): boolean {
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

/**
 * Registers an ambient package and reconciles its resources
 * @param pkg - The UDS package to register
 */
export async function registerAmbientPackage(pkg: UDSPackage): Promise<void> {
  const namespace = pkg.metadata?.namespace;
  if (!namespace) return;

  const selector = pkg.spec?.sso?.find(s => s.enableAuthserviceSelector)?.enableAuthserviceSelector;
  if (!selector) return;

  const serviceSelector = Object.entries(selector)
    .map(([k, v]) => `${k}=${v}`)
    .join(",");
  const [services, pods] = await Promise.all([
    K8s(a.Service).InNamespace(namespace).WithLabel(serviceSelector).Get(),
    K8s(a.Pod).InNamespace(namespace).WithLabel(serviceSelector).Get(),
  ]);

  await Promise.all([
    ...(services.items || []).map(svc => reconcileService(svc)),
    ...(pods.items || []).map(pod => reconcilePod(pod)),
  ]);
}

/**
 * Unregisters an ambient package and cleans up resources
 * @param pkg - The UDS package to unregister
 * @param waypointId - The waypoint ID
 */
export async function unregisterAmbientPackage(pkg: UDSPackage, waypointId: string): Promise<void> {
  const { namespace, name } = pkg.metadata || {};
  if (!namespace || !name) return;

  const waypointName = getWaypointName(waypointId);
  log.info("Unregistering ambient waypoint", {
    namespace,
    package: name,
    waypointName,
  });
}
