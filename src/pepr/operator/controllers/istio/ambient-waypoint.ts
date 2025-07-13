/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { a, K8s } from "pepr";
import { K8sGateway, UDSPackage } from "../../crd";
import { PackageStore } from "../packages/package-store";
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

export function getWaypointName(waypointId: string): string {
  // Avoid double prefixing by checking if the ID already starts with 'uds-core-'
  const prefix = waypointId.startsWith("uds-core-") ? "" : "uds-core-";
  return `${prefix}${waypointId}${WAYPOINT_SUFFIX}`;
}

export function createManagedLabels(
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

/**
 * Checks if a service matches the provided selector
 * @param svc - The service to check
 * @param selector - Label selector to match against
 * @returns boolean indicating if the selector matches the service
 */
export function serviceMatchesSelector(svc: a.Service, selector: Record<string, string>): boolean {
  const svcSelector = svc.spec?.selector;
  if (!svcSelector) return false;

  return Object.entries(selector).every(([k, v]) => svcSelector[k] === v);
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
export async function createWaypointGateway(pkg: UDSPackage, waypointId: string) {
  const { namespace, name } = pkg.metadata || {};
  if (!namespace || !name) {
    throw new Error("Package metadata is missing namespace or name");
  }

  const waypointName = getWaypointName(waypointId);
  log.info(`Creating waypoint gateway for package: ${namespace}/${name}`, { waypointName });

  // Extract app selector from SSO configuration
  let appSelector: Record<string, string> | undefined;
  if (pkg.spec?.sso && pkg.spec.sso.length > 0) {
    for (const ssoConfig of pkg.spec.sso) {
      if (ssoConfig.enableAuthserviceSelector) {
        appSelector = ssoConfig.enableAuthserviceSelector;
        break;
      }
    }
  }

  try {
    // Check if gateway already exists and is ready
    const existing = await K8s(K8sGateway).InNamespace(namespace).Get(waypointName);
    if (isGatewayReady(existing)) {
      log.info("Waypoint Gateway already exists and is ready", { namespace, waypointName });
      return waypointName;
    }
    log.info("Waypoint Gateway exists but is not ready, waiting...", { namespace, waypointName });
    return waypointName;
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
        "app.kubernetes.io/name": waypointId,
        "istio.io/waypoint-for": "all",
        "istio.io/gateway-name": waypointName,
        // Add app selector labels from the package's SSO configuration
        ...(appSelector || {}),
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
      return waypointName;
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
}

/**
 * Registers a package for ambient waypoint handling
 * @param pkg - The UDS package to register
 * @returns A promise that resolves when registration is complete
 */
export async function registerAmbientPackage(pkg: UDSPackage, waypointId: string): Promise<void> {
  const namespace = pkg.metadata?.namespace;
  if (!namespace) {
    log.warn("Cannot register package without a namespace", { waypointId });
    return;
  }

  // The package is already registered in PackageStore with the necessary labels
  // We just need to reconcile existing resources
  try {
    const selectors =
      pkg.spec?.sso
        ?.filter(s => s.enableAuthserviceSelector)
        .map(s => s.enableAuthserviceSelector || {}) || [];

    // Reconcile existing services and pods
    const serviceSelector = selectors
      .map(s => Object.entries(s).map(([k, v]) => `${k}=${v}`))
      .flat()
      .join(",");

    if (serviceSelector) {
      const services = await K8s(a.Service).InNamespace(namespace).WithLabel(serviceSelector).Get();
      for (const svc of services.items || []) {
        await reconcileService(svc);
      }

      const pods = await K8s(a.Pod).InNamespace(namespace).WithLabel(serviceSelector).Get();
      for (const pod of pods.items || []) {
        await reconcilePod(pod);
      }
    }
  } catch (error) {
    log.error(
      `Error reconciling resources for package ${pkg.metadata?.name} in namespace ${namespace}`,
      {
        error,
        namespace,
        waypointId,
      },
    );
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
export async function waitForWaypointPodHealthy(
  namespace: string,
  waypointName: string,
): Promise<void> {
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
 * Generate and apply NetworkPolicies for waypoint-app traffic
 */
export async function generateWaypointNetworkPolicies(
  pkg: UDSPackage,
  waypointName: string,
  appSelector: Record<string, string>,
) {
  const namespace = pkg.metadata?.namespace;
  if (!namespace) return;

  // Waypoint pod selector
  const waypointPodSelector = { matchLabels: { "istio.io/gateway-name": waypointName } };
  // App pod selector
  const appPodSelector = { matchLabels: appSelector };

  // Ingress: app -> waypoint
  const ingressNetpol = {
    apiVersion: "networking.k8s.io/v1",
    kind: "NetworkPolicy",
    metadata: {
      name: `${waypointName}-ingress-from-app`,
      namespace,
      labels: { "uds/managed-by": "uds-operator" },
    },
    spec: {
      podSelector: waypointPodSelector,
      ingress: [
        {
          from: [{ podSelector: appPodSelector }],
          // No ports field: allow all ports
        },
      ],
      policyTypes: ["Ingress"],
    },
  };

  // Egress: waypoint -> app
  const egressNetpol = {
    apiVersion: "networking.k8s.io/v1",
    kind: "NetworkPolicy",
    metadata: {
      name: `${waypointName}-egress-to-app`,
      namespace,
      labels: { "uds/managed-by": "uds-operator" },
    },
    spec: {
      podSelector: waypointPodSelector,
      egress: [
        {
          to: [{ podSelector: appPodSelector }],
          // No ports field: allow all ports
        },
      ],
      policyTypes: ["Egress"],
    },
  };

  // Apply both
  await K8s(a.NetworkPolicy).Apply(ingressNetpol, { force: true });
  await K8s(a.NetworkPolicy).Apply(egressNetpol, { force: true });
}

/**
 * Sets up an ambient waypoint for a package
 * @param pkg - The package to set up the ambient waypoint for
 * @param waypointId - The ID of the waypoint to set up
 */
export async function setupAmbientWaypoint(pkg: UDSPackage, waypointId: string): Promise<void> {
  const { namespace, name } = pkg.metadata || {};
  if (!namespace || !name) {
    throw new Error("Package metadata is missing namespace or name");
  }

  const waypointName = getWaypointName(waypointId);
  log.info("Starting ambient waypoint setup", {
    namespace,
    package: name,
    waypointId,
    waypointName,
  });

  try {
    log.debug("Creating waypoint gateway", { namespace, waypointName });
    await createWaypointGateway(pkg, waypointId);

    log.debug("Waiting for waypoint pod to become healthy", { namespace, waypointName });
    // Check waypoint pod health using environment variable configuration
    await waitForWaypointPodHealthy(namespace, waypointName);

    // Extract app selector from SSO config (same as in createWaypointGateway)
    let appSelector: Record<string, string> | undefined;
    if (pkg.spec?.sso && pkg.spec.sso.length > 0) {
      for (const ssoConfig of pkg.spec.sso) {
        if (ssoConfig.enableAuthserviceSelector) {
          appSelector = ssoConfig.enableAuthserviceSelector;
          break;
        }
      }
    }
    if (appSelector) {
      await generateWaypointNetworkPolicies(pkg, waypointName, appSelector);
    }

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
export async function unregisterAmbientPackage(pkg: UDSPackage, waypointId: string): Promise<void> {
  const { namespace, name } = pkg.metadata || {};
  if (!namespace || !name) {
    log.warn("Package metadata is missing namespace or name, skipping unregistration");
    return;
  }

  const waypointName = getWaypointName(waypointId);
  const logContext = { namespace, package: name, waypointName, waypointId };

  try {
    log.info("Deleting waypoint gateway", logContext);

    // Delete the waypoint gateway if it exists
    try {
      // Gateway will be garbage collected by owner reference
      log.debug("Waypoint gateway will be garbage collected by owner reference", logContext);
    } catch (error) {
      log.error("Error during waypoint gateway cleanup", { error, ...logContext });
      throw error;
    }

    // Package cleanup is handled by the package watch
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

  // Get all ambient packages in this namespace
  const ambientPkgs = PackageStore.getAmbientPackagesByNamespace(namespace);

  for (const pkg of ambientPkgs) {
    if (!pkg.metadata?.name) continue;

    const waypointName = getWaypointName(pkg.metadata.name);
    const selectors =
      (pkg.spec?.sso || [])
        .filter(
          (s: { enableAuthserviceSelector?: Record<string, string> }) =>
            s.enableAuthserviceSelector,
        )
        .map(s => s.enableAuthserviceSelector || {}) || [];

    if (selectors.some(selector => serviceMatchesSelector(svc, selector))) {
      // Update the service with waypoint labels
      svc.metadata = {
        ...(svc.metadata || {}),
        labels: {
          ...(svc.metadata?.labels || {}),
          [ISTIO_WAYPOINT_LABEL]: waypointName,
          "istio.io/ingress-use-waypoint": "true",
        },
      };
      return;
    }
  }
}

/**
 * Reconciles a pod for ambient waypoint handling
 * @param pod - The pod to reconcile
 * @returns A promise that resolves when reconciliation is complete
 */
export async function reconcilePod(pod: a.Pod): Promise<void> {
  const namespace = pod.metadata?.namespace;
  if (!namespace) return;

  // Get all ambient packages in this namespace
  const ambientPkgs = PackageStore.getAmbientPackagesByNamespace(namespace);

  for (const pkg of ambientPkgs) {
    if (!pkg.metadata?.name) continue;

    const waypointName = getWaypointName(pkg.metadata.name);
    const selectors =
      (pkg.spec?.sso || [])
        .filter(
          (s: { enableAuthserviceSelector?: Record<string, string> }) =>
            s.enableAuthserviceSelector,
        )
        .map(s => s.enableAuthserviceSelector || {}) || [];

    // Check if pod matches any selector (OR operation)
    const matches = selectors.some(selector =>
      Object.entries(selector).every(([k, v]) => pod.metadata?.labels?.[k] === v),
    );

    if (matches) {
      // Update the pod with waypoint labels
      pod.metadata = {
        ...(pod.metadata || {}),
        labels: {
          ...(pod.metadata?.labels || {}),
          [ISTIO_WAYPOINT_LABEL]: waypointName,
        },
      };
      return;
    }
  }
}
