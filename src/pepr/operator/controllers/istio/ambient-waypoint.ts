/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { a, K8s, kind } from "pepr";
import { K8sGateway, UDSPackage } from "../../crd";
import { getOwnerRef } from "../utils";
import { log } from "./istio-resources";

// Environment variable configuration for waypoint health check
const WAYPOINT_HEALTH_MAX_ATTEMPTS = parseInt(process.env.WAYPOINT_HEALTH_MAX_ATTEMPTS || "10", 10);
const WAYPOINT_HEALTH_INTERVAL_MS = parseInt(process.env.WAYPOINT_HEALTH_INTERVAL_MS || "5000", 10);
const WAYPOINT_HEALTH_TIMEOUT_MS = parseInt(process.env.WAYPOINT_HEALTH_TIMEOUT_MS || "60000", 10);

const UDS_MANAGED_LABEL = "uds/managed-by";
const UDS_PACKAGE_LABEL = "uds/package";
const UDS_NAMESPACE_LABEL = "uds/namespace";
const ISTIO_WAYPOINT_LABEL = "istio.io/use-waypoint";
const WAYPOINT_SUFFIX = "-waypoint";

function getWaypointName(clientId: string): string {
  return `${clientId}${WAYPOINT_SUFFIX}`;
}

function createManagedLabels(
  pkg: UDSPackage,
  waypointName: string,
  additionalLabels: Record<string, string> = {},
) {
  return {
    [UDS_MANAGED_LABEL]: "uds-operator",
    [UDS_PACKAGE_LABEL]: pkg.metadata?.name || "",
    [UDS_NAMESPACE_LABEL]: pkg.metadata?.namespace || "",
    [ISTIO_WAYPOINT_LABEL]: waypointName,
    ...additionalLabels,
  };
}

interface AmbientPackageInfo {
  pkg: UDSPackage;
  selectors: Array<Record<string, string>>;
  waypointName: string;
  clientId: string;
  namespace: string;
}

// In-memory store for packages that need ambient waypoint
const ambientPackages = new Map<string, AmbientPackageInfo>();
const ambientPackagesByNamespace = new Map<string, AmbientPackageInfo[]>();

/**
 * Checks if a service matches any of the provided selectors
 * @param svc - The service to check
 * @param selectors - Array of label selectors to match against
 * @returns boolean indicating if any selector matches the service
 */
function serviceMatchesSelectors(
  svc: a.Service,
  selectors: Array<Record<string, string>>,
): boolean {
  return Boolean(
    svc.spec?.selector &&
      selectors.some(selector =>
        Object.entries(selector).every(([k, v]) => svc.spec?.selector?.[k] === v),
      ),
  );
}

/**
 * Checks if a gateway is in a ready state
 */
export function isGatewayReady(gateway: K8sGateway): boolean {
  const conditions = gateway.status?.conditions || [];
  const acceptedCondition = conditions.find(c => c.type === "Accepted");
  const programmedCondition = conditions.find(c => c.type === "Programmed");

  return Boolean(acceptedCondition?.status === "True" && programmedCondition?.status === "True");
}

/**
 * Checks if the waypoint pod is healthy by verifying:
 * 1. The pod is in Running state
 * 2. All containers are ready
 * 3. The pod has connected to istiod (checking specific readiness probe or logs)
 *
 * @param namespace - The namespace where the waypoint pod is running
 * @param waypointName - The name of the waypoint gateway
 * @returns A promise that resolves to a boolean indicating if the waypoint pod is healthy
 */
export async function isWaypointPodHealthy(
  namespace: string,
  waypointName: string,
): Promise<boolean> {
  // Use label selector for efficiency
  const pods = await K8s(a.Pod)
    .InNamespace(namespace)
    .WithLabel(`istio.io/gateway-name=${waypointName}`)
    .Get();

  for (const pod of pods.items || []) {
    // Log if istio-proxy container has restarted
    const proxyStatus = pod.status?.containerStatuses?.find(cs => cs.name === "istio-proxy");
    if (proxyStatus && proxyStatus.restartCount && proxyStatus.restartCount > 0) {
      log.warn(
        `istio-proxy container for waypoint ${waypointName} in pod ${pod.metadata?.name} has restarted ${proxyStatus.restartCount} times`,
        { namespace },
      );
    }
    // All containers ready check is sufficient, no need for redundant istioProxyContainer check
    if (pod.status?.phase === "Running" && pod.status?.containerStatuses?.every(cs => cs.ready)) {
      return true;
    }
  }
  return false;
}

/**
 * Creates a waypoint gateway for the given package
 */
export async function createWaypointGateway(pkg: UDSPackage, clientId: string) {
  const { namespace, name } = pkg.metadata || {};
  if (!namespace || !name) {
    throw new Error("Package metadata is missing namespace or name");
  }

  const waypointName = getWaypointName(clientId);
  log.info(`Creating waypoint gateway for package: ${namespace}/${name}`, { waypointName });

  try {
    // Check if gateway already exists and is ready
    const existing = await K8s(K8sGateway).InNamespace(namespace).Get(waypointName);
    if (isGatewayReady(existing)) {
      log.info("Waypoint Gateway already exists and is ready", { namespace, waypointName });
      return waypointName;
    }
    log.info("Waypoint Gateway exists but is not ready, waiting...", { namespace, waypointName });
  } catch (notFoundError) {
    // Gateway doesn't exist, log the error and create it
    const errorMessage =
      notFoundError instanceof Error ? notFoundError.message : String(notFoundError);
    log.debug("Waypoint Gateway not found, creating new one", {
      namespace,
      waypointName,
      error: errorMessage,
    });
    log.info("Creating new Waypoint Gateway", { namespace, waypointName });

    const gateway = new K8sGateway();
    gateway.metadata = {
      name: waypointName,
      namespace,
      labels: createManagedLabels(pkg, waypointName, {
        "app.kubernetes.io/component": "ambient-waypoint",
        "app.kubernetes.io/name": clientId,
        "istio.io/waypoint-for": "all",
        "istio.io/gateway-name": waypointName,
      }),
      ownerReferences: getOwnerRef(pkg),
      annotations: {
        "uds.dev/created-at": new Date().toISOString(),
        ...(pkg.metadata?.annotations || {}),
      },
    };

    gateway.spec = {
      gatewayClassName: "istio-waypoint",
      listeners: [
        {
          name: "mesh",
          port: 15008,
          protocol: "HBONE",
        },
      ],
    };

    try {
      await K8s(K8sGateway).Apply(gateway, { force: true });
      log.info("Successfully applied Waypoint Gateway", { namespace, waypointName });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.error("Failed to apply Waypoint Gateway", {
        namespace,
        waypointName,
        error: errorMessage,
      });
      throw new Error(`Failed to create waypoint gateway: ${errorMessage}`);
    }
  }

  log.info("Waiting for Waypoint Gateway to become ready", { namespace, waypointName });
}

/**
 * Registers a package for ambient waypoint handling
 * @param pkg - The UDS package to register
 * @returns A promise that resolves when registration is complete
 */
export async function registerAmbientPackage(pkg: UDSPackage, clientId: string): Promise<void> {
  const namespace = pkg.metadata?.namespace;
  if (!namespace) {
    log.warn("Cannot register package without a namespace", { clientId });
    return;
  }

  const key = clientId;
  const waypointName = getWaypointName(clientId);
  const selectors =
    pkg.spec?.sso
      ?.filter(s => s.enableAuthserviceSelector)
      .map(s => s.enableAuthserviceSelector || {}) || [];

  // Store package info with all required fields
  const packageInfo: AmbientPackageInfo = {
    pkg,
    selectors,
    waypointName,
    clientId,
    namespace,
  };

  ambientPackages.set(key, packageInfo);

  // Update namespace index for efficient lookup
  if (!ambientPackagesByNamespace.has(namespace)) {
    ambientPackagesByNamespace.set(namespace, []);
  }
  ambientPackagesByNamespace.get(namespace)!.push(packageInfo);

  // Reconcile existing services and pods efficiently
  try {
    const services = await K8s(a.Service).InNamespace(namespace).Get();
    const pods = await K8s(a.Pod).InNamespace(namespace).Get();
    // Use map lookups for selectors
    for (const svc of services.items || []) {
      await reconcileService(svc);
    }
    for (const pod of pods.items || []) {
      await reconcilePod(pod);
    }
  } catch (error) {
    log.error(`Error reconciling existing resources for package ${key}`, {
      error,
      namespace,
      clientId,
    });
  }
}

/**
 * Waits for the waypoint pod to become healthy with a timeout
 *
 * @param namespace - The namespace where the waypoint pod is running
 * @param waypointName - The name of the waypoint gateway
 * @param options - Configuration options for the wait operation
 * @returns A promise that resolves when the pod is healthy or rejects on timeout
 */
async function waitForWaypointPodHealthy(namespace: string, waypointName: string): Promise<void> {
  const logContext = {
    namespace,
    waypointName,
    WAYPOINT_HEALTH_MAX_ATTEMPTS,
    WAYPOINT_HEALTH_INTERVAL_MS,
    WAYPOINT_HEALTH_TIMEOUT_MS,
  };
  log.debug("Starting waypoint pod health check", logContext);

  const startTime = Date.now();

  for (let attempt = 1; attempt <= WAYPOINT_HEALTH_MAX_ATTEMPTS; attempt++) {
    // Check if we've exceeded the max attempts (primary condition)
    if (attempt > WAYPOINT_HEALTH_MAX_ATTEMPTS) {
      const errorMessage = `Waypoint pod for ${waypointName} in namespace ${namespace} did not become healthy after ${WAYPOINT_HEALTH_MAX_ATTEMPTS} attempts (${(WAYPOINT_HEALTH_MAX_ATTEMPTS * WAYPOINT_HEALTH_INTERVAL_MS) / 1000} seconds total)`;
      log.error(errorMessage, logContext);
      throw new Error(errorMessage);
    }

    // Secondary timeout check as a safety measure
    if (Date.now() - startTime > WAYPOINT_HEALTH_TIMEOUT_MS) {
      const errorMessage = `Waypoint pod for ${waypointName} in namespace ${namespace} did not become healthy within ${WAYPOINT_HEALTH_TIMEOUT_MS / 1000} seconds timeout`;
      log.error(errorMessage, logContext);
      throw new Error(errorMessage);
    }

    try {
      const isHealthy = await isWaypointPodHealthy(namespace, waypointName);

      if (isHealthy) {
        log.info("Waypoint pod is healthy", {
          ...logContext,
          attempt,
          durationMs: Date.now() - startTime,
        });
        return;
      }

      log.debug("Waypoint pod not healthy yet, waiting", {
        ...logContext,
        attempt,
        elapsedMs: Date.now() - startTime,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.warn("Error checking waypoint pod health", {
        ...logContext,
        attempt,
        error: errorMessage,
      });
    }

    if (attempt < WAYPOINT_HEALTH_MAX_ATTEMPTS) {
      await new Promise(resolve => setTimeout(resolve, WAYPOINT_HEALTH_INTERVAL_MS));
    }
  }

  const errorMessage = `Waypoint pod for ${waypointName} in namespace ${namespace} did not become healthy after ${WAYPOINT_HEALTH_MAX_ATTEMPTS} attempts`;
  log.error(errorMessage, logContext);
  throw new Error(errorMessage);
}

/**
 * Sets up all resources needed for ambient waypoint functionality
 */
export async function setupAmbientWaypoint(pkg: UDSPackage, clientId: string): Promise<void> {
  const { namespace, name } = pkg.metadata || {};
  if (!namespace || !name) {
    throw new Error("Package metadata is missing namespace or name");
  }

  const waypointName = getWaypointName(clientId);
  log.info("Starting ambient waypoint setup", { namespace, package: name, clientId, waypointName });

  try {
    log.debug("Creating waypoint gateway", { namespace, waypointName });
    await createWaypointGateway(pkg, clientId);

    log.debug("Waiting for waypoint pod to become healthy", { namespace, waypointName });
    // Check waypoint pod health using environment variable configuration
    await waitForWaypointPodHealthy(namespace, waypointName);

    log.info("Successfully set up ambient waypoint", {
      namespace,
      package: name,
      waypointName,
    });
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
 * Unregisters a package for ambient waypoint handling
 */
export async function unregisterAmbientPackage(pkg: UDSPackage, clientId: string): Promise<void> {
  const { namespace, name } = pkg.metadata || {};
  if (!namespace || !name) {
    log.warn("Package metadata is missing namespace or name, skipping unregistration");
    return;
  }

  const waypointName = getWaypointName(clientId);
  const packageKey = clientId;
  const logContext = { namespace, package: name, waypointName, clientId };

  try {
    log.info("Deleting waypoint gateway", logContext);

    // Delete the waypoint gateway if it exists
    try {
      await K8s(K8sGateway).InNamespace(namespace).Delete(waypointName);
      log.debug("Successfully deleted waypoint gateway", logContext);
    } catch (error) {
      // Ignore 404 errors as the resource might already be deleted
      if (error?.status !== 404) {
        throw error;
      }
      log.debug("Waypoint gateway not found, continuing cleanup", logContext);
    }

    // Clean up in-memory state
    ambientPackages.delete(packageKey);
    log.info("Successfully unregistered ambient waypoint", logContext);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error("Failed to clean up ambient waypoint resources", {
      ...logContext,
      error: errorMessage,
    });
    throw new Error(`Failed to clean up ambient waypoint: ${errorMessage}`);
  }
}

/**
 * Reconciles a service for ambient waypoint handling
 * @param svc - The service to reconcile
 * @returns A promise that resolves when reconciliation is complete
 */
export async function reconcileService(svc: a.Service): Promise<void> {
  const namespace = svc.metadata?.namespace;
  if (!namespace) return;

  const pkgs = ambientPackagesByNamespace.get(namespace) || [];
  for (const { pkg, selectors, waypointName } of pkgs) {
    if (serviceMatchesSelectors(svc, selectors)) {
      const needsUpdate =
        svc.metadata?.labels?.["istio.io/use-waypoint"] !== waypointName ||
        svc.metadata?.labels?.["uds/managed-by"] !== "uds-operator" ||
        !svc.metadata?.ownerReferences?.some(
          (ref: { kind?: string; name?: string }) =>
            ref.kind === (pkg.kind || "UDSPackage") && ref.name === pkg.metadata?.name,
        );
      if (needsUpdate) {
        svc.metadata = {
          ...(svc.metadata || {}),
          labels: createManagedLabels(pkg, waypointName, {
            "istio.io/ingress-use-waypoint": "true",
            ...(svc.metadata?.labels || {}),
          }),
          ownerReferences: [
            ...(svc.metadata?.ownerReferences?.filter(
              (ref: { kind?: string; name?: string }) =>
                !(ref.kind === (pkg.kind || "UDSPackage") && ref.name === pkg.metadata?.name),
            ) || []),
            ...getOwnerRef(pkg),
          ],
        };
      }
      return;
    }
  }
}

export async function reconcilePod(pod: a.Pod): Promise<void> {
  const namespace = pod.metadata?.namespace;
  if (!namespace) return;

  const pkgs = ambientPackagesByNamespace.get(namespace) || [];
  for (const { pkg, selectors, waypointName } of pkgs) {
    const matches = selectors.some(selector =>
      Object.entries(selector).every(([k, v]) => pod.metadata?.labels?.[k] === v),
    );
    if (matches) {
      const needsUpdate =
        pod.metadata?.labels?.["istio.io/use-waypoint"] !== waypointName ||
        pod.metadata?.labels?.["uds/managed-by"] !== "uds-operator" ||
        !pod.metadata?.ownerReferences?.some(
          (ref: { kind?: string; name?: string }) =>
            ref.kind === (pkg.kind || "UDSPackage") && ref.name === pkg.metadata?.name,
        );
      if (needsUpdate) {
        pod.metadata = {
          ...(pod.metadata || {}),
          labels: createManagedLabels(pkg, waypointName, {
            ...(pod.metadata?.labels || {}),
          }),
          ownerReferences: [
            ...(pod.metadata?.ownerReferences?.filter(
              (ref: { kind?: string; name?: string }) =>
                !(ref.kind === (pkg.kind || "UDSPackage") && ref.name === pkg.metadata?.name),
            ) || []),
            ...getOwnerRef(pkg),
          ],
        };
      }
      return;
    }
  }
}

/**
 * Checks if ambient mode is enabled in the given namespace
 * @param namespace - The namespace to check
 * @returns A promise that resolves to a boolean indicating if ambient is enabled
 */
export async function isAmbientEnabled(namespace: string): Promise<boolean> {
  try {
    const ns = await K8s(kind.Namespace).Get(namespace);
    return ns.metadata?.labels?.["istio.io/dataplane-mode"] === "ambient";
  } catch (error) {
    log.error(`Error checking if namespace ${namespace} is ambient enabled`, { error });
    return false;
  }
}
