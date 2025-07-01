/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { V1OwnerReference } from "@kubernetes/client-node";
import { a, K8s, kind } from "pepr";
import { K8sGateway, UDSPackage } from "../../crd";
import { log } from "./istio-resources";

// Constants
const WAYPOINT_SUFFIX = "-waypoint";
const UDS_MANAGED_LABEL = "uds/managed-by";
const UDS_PACKAGE_LABEL = "uds/package";
const UDS_NAMESPACE_LABEL = "uds/namespace";
const ISTIO_WAYPOINT_LABEL = "istio.io/use-waypoint";

// Utility Functions
function getWaypointName(clientId: string): string {
  return `${clientId}${WAYPOINT_SUFFIX}`;
}

function createOwnerReference(pkg: UDSPackage): V1OwnerReference {
  return {
    apiVersion: pkg.apiVersion || "uds.dev/v1alpha1",
    kind: pkg.kind || "UDSPackage",
    name: pkg.metadata?.name || "",
    uid: pkg.metadata?.uid || "",
    controller: true,
    blockOwnerDeletion: true,
  };
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
function isGatewayReady(gateway: K8sGateway): boolean {
  const conditions = gateway.status?.conditions || [];
  const acceptedCondition = conditions.find(c => c.type === "Accepted");
  const programmedCondition = conditions.find(c => c.type === "Programmed");

  return Boolean(acceptedCondition?.status === "True" && programmedCondition?.status === "True");
}

/**
 * Verifies that a waypoint gateway exists and returns it
 */
async function verifyWaypointExists(namespace: string, waypointName: string): Promise<K8sGateway> {
  try {
    const gateway = await K8s(K8sGateway).InNamespace(namespace).Get(waypointName);
    log.debug("Verified waypoint gateway exists", { namespace, waypointName });
    return gateway;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Waypoint Gateway ${waypointName} not found in namespace ${namespace}: ${errorMessage}`,
    );
  }
}

/**
 * Creates a waypoint gateway for the given package
 */
export async function createWaypointGateway(pkg: UDSPackage, clientId: string): Promise<string> {
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
  } catch (error) {
    // Gateway doesn't exist, create it
    log.info("Creating new Waypoint Gateway", { namespace, waypointName });

    const gateway = new K8sGateway();
    gateway.metadata = {
      name: waypointName,
      namespace,
      labels: createManagedLabels(pkg, waypointName, {
        "app.kubernetes.io/component": "ambient-waypoint",
        "app.kubernetes.io/name": clientId,
        "istio.io/waypoint-for": "all",
      }),
      ownerReferences: [createOwnerReference(pkg)],
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
  return waitForWaypointReady(waypointName, namespace);
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

  // Reconcile existing services and pods
  try {
    // Reconcile services
    const services = await K8s(a.Service).InNamespace(namespace).Get();
    for (const svc of services.items || []) {
      await reconcileService(svc);
    }

    // Reconcile pods
    const pods = await K8s(a.Pod).InNamespace(namespace).Get();
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
 * Waits for a waypoint gateway to become ready
 */
async function waitForWaypointReady(
  name: string,
  namespace: string,
  options: { maxAttempts?: number; intervalMs?: number } = {},
): Promise<string> {
  const { maxAttempts = 10, intervalMs = 2000 } = options;
  const logContext = { name, namespace, maxAttempts, intervalMs };

  log.info("Waiting for Waypoint Gateway to become ready", logContext);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const attemptStart = Date.now();

    try {
      log.debug(`Checking waypoint status (attempt ${attempt}/${maxAttempts})`, logContext);
      const gateway = await verifyWaypointExists(namespace, name);

      if (isGatewayReady(gateway)) {
        log.info("Waypoint Gateway is ready", {
          ...logContext,
          attempt,
          durationMs: Date.now() - attemptStart,
        });
        return name;
      }

      log.debug("Waypoint Gateway not ready yet", {
        ...logContext,
        attempt,
        conditions: gateway.status?.conditions?.map(c => ({
          type: c.type,
          status: c.status,
          message: c.message,
          reason: c.reason,
        })),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.warn("Error checking waypoint status", {
        ...logContext,
        attempt,
        error: errorMessage,
      });
    }

    if (attempt < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
  }

  const errorMessage = `Waypoint Gateway ${name} in namespace ${namespace} did not become ready after ${maxAttempts} attempts`;
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

    log.debug("Waiting for waypoint to become ready", { namespace, waypointName });
    await waitForWaypointReady(waypointName, namespace);

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

  for (const [, { pkg, selectors, waypointName }] of ambientPackages) {
    if (pkg.metadata?.namespace !== namespace) continue;

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
          labels: {
            ...(svc.metadata?.labels || {}),
            "istio.io/use-waypoint": waypointName,
            "istio.io/ingress-use-waypoint": "true",
            "uds/managed-by": "uds-operator",
            "uds/package": pkg.metadata?.name || "",
            "uds/namespace": namespace,
          },
          ownerReferences: [
            ...(svc.metadata?.ownerReferences?.filter(
              (ref: { kind?: string; name?: string }) =>
                !(ref.kind === (pkg.kind || "UDSPackage") && ref.name === pkg.metadata?.name),
            ) || []),
            {
              apiVersion: pkg.apiVersion || "uds.dev/v1alpha1",
              kind: pkg.kind || "UDSPackage",
              name: pkg.metadata?.name || "",
              uid: pkg.metadata?.uid || "",
              controller: true,
              blockOwnerDeletion: true,
            },
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

  for (const [, { pkg, selectors, waypointName }] of ambientPackages) {
    if (pkg.metadata?.namespace !== namespace) continue;

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
          labels: {
            ...(pod.metadata?.labels || {}),
            "istio.io/use-waypoint": waypointName,
            "uds/managed-by": "uds-operator",
            "uds/package": pkg.metadata?.name || "",
            "uds/namespace": namespace,
          },
          ownerReferences: [
            ...(pod.metadata?.ownerReferences?.filter(
              (ref: { kind?: string; name?: string }) =>
                !(ref.kind === (pkg.kind || "UDSPackage") && ref.name === pkg.metadata?.name),
            ) || []),
            {
              apiVersion: pkg.apiVersion || "uds.dev/v1alpha1",
              kind: pkg.kind || "UDSPackage",
              name: pkg.metadata?.name || "",
              uid: pkg.metadata?.uid || "",
              controller: true,
              blockOwnerDeletion: true,
            },
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
