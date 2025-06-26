/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { a, K8s, kind } from "pepr";
import { UDSConfig } from "../../../config";
import {
  IstioAuthorizationPolicy,
  IstioRequestAuthentication,
  K8sGateway,
  UDSPackage,
} from "../../crd";
import { Action } from "../../crd/generated/istio/authorizationpolicy-v1beta1";
import { log } from "./istio-resources";

interface AmbientPackageInfo {
  pkg: UDSPackage;
  selectors: Array<Record<string, string>>;
  waypointName: string;
}

// In-memory store for packages that need ambient waypoint
const ambientPackages = new Map<string, AmbientPackageInfo>();
// Track waypoint readiness state
const waypointReadiness = new Map<string, boolean>();

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
  if (!svc.spec?.selector) return false;
  return selectors.some(selector =>
    Object.entries(selector).every(([k, v]) => svc.spec?.selector?.[k] === v),
  );
}

/**
 * Generates a unique key for a package
 * @param pkg - The UDS package
 * @returns string in format "namespace/name"
 */
function getPackageKey(pkg: UDSPackage): string {
  return `${pkg.metadata?.namespace}/${pkg.metadata?.name}`;
}

/**
 * Generates a unique key for a waypoint
 * @param namespace - The namespace of the waypoint
 * @param waypointName - The name of the waypoint
 * @returns string in format "namespace/name"
 */
function getWaypointKey(namespace: string, waypointName: string): string {
  return `${namespace}/${waypointName}`;
}

/**
 * Checks if a gateway is in a ready state
 * @param gateway - The gateway to check
 * @returns boolean indicating if the gateway is ready
 */
function isGatewayReady(gateway: K8sGateway): boolean {
  const conditions = gateway.status?.conditions || [];
  const acceptedCondition = conditions.find(c => c.type === "Accepted");
  const programmedCondition = conditions.find(c => c.type === "Programmed");

  const isReady = Boolean(
    acceptedCondition?.status === "True" && programmedCondition?.status === "True",
  );

  const logData = {
    namespace: gateway.metadata?.namespace,
    name: gateway.metadata?.name,
    conditions: conditions.map(c => ({
      type: c.type,
      status: c.status,
      reason: c.reason,
      message: "message" in c ? String(c.message) : undefined,
      lastTransitionTime: "lastTransitionTime" in c ? String(c.lastTransitionTime) : undefined,
    })),
    generation: gateway.metadata?.generation,
    observedGeneration: gateway.metadata?.generation,
  };

  if (isReady) {
    log.debug(`Gateway ${gateway.metadata?.name} is ready`, logData);
  } else {
    log.debug(`Gateway ${gateway.metadata?.name} is not ready`, logData, {
      acceptedStatus: acceptedCondition?.status,
      programmedStatus: programmedCondition?.status,
    });
  }

  return isReady;
}

/**
 * Verifies that a waypoint gateway exists and returns it
 * @param namespace - The namespace of the waypoint
 * @param waypointName - The name of the waypoint
 * @returns The found K8sGateway
 * @throws Error if the waypoint is not found
 */
async function verifyWaypointExists(namespace: string, waypointName: string): Promise<K8sGateway> {
  const startTime = Date.now();
  const logContext = { namespace, waypointName };

  log.debug(`Verifying waypoint gateway exists`, logContext);

  try {
    const gateway = await K8s(K8sGateway).InNamespace(namespace).Get(waypointName);
    const duration = Date.now() - startTime;

    log.debug(`Successfully verified waypoint gateway exists`, {
      ...logContext,
      durationMs: duration,
      gatewayStatus: gateway.status,
      generation: gateway.metadata?.generation,
      resourceVersion: gateway.metadata?.resourceVersion,
    });

    return gateway;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : "No stack trace";
    const duration = Date.now() - startTime;

    log.error(`Failed to verify waypoint gateway`, {
      ...logContext,
      error: errorMessage,
      stack: errorStack,
      durationMs: duration,
      errorType: error?.constructor?.name || typeof error,
    });

    throw new Error(
      `Waypoint Gateway ${waypointName} not found in namespace ${namespace}: ${errorMessage}`,
    );
  }
}

/**
 * Creates a waypoint gateway for the given package
 * @param pkg - The UDS package to create the waypoint for
 * @returns A promise that resolves to the name of the created waypoint
 * @throws Error if the waypoint cannot be created
 */
export async function createWaypointGateway(pkg: UDSPackage): Promise<string> {
  const { namespace, name } = pkg.metadata!;
  log.info(`Creating waypoint gateway for package: ${namespace}/${name}`);

  // Sanitize the namespace and name to create a valid k8s resource name
  const sanitizeName = (s: string) => s.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const waypointName = `${sanitizeName(namespace!)}-${sanitizeName(name!)}-waypoint`;
  log.debug(`Generated waypoint name: ${waypointName}`, { namespace });

  const labels = {
    "istio.io/waypoint-for": "all",
    "app.kubernetes.io/created-by": "uds-operator",
    "app.kubernetes.io/part-of": name!,
  };

  try {
    log.debug(`Checking if waypoint gateway ${waypointName} already exists`, { namespace });
    const existing = await K8s(K8sGateway).InNamespace(namespace!).Get(waypointName);
    if (isGatewayReady(existing)) {
      log.info(`Waypoint Gateway ${waypointName} already exists and is ready`, { namespace });
      return waypointName;
    }
    log.info(`Waypoint Gateway ${waypointName} exists but is not ready, waiting...`, { namespace });
  } catch (error) {
    log.info(`Waypoint Gateway ${waypointName} does not exist, will create it`, {
      namespace,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  log.info(`Creating new Waypoint Gateway: ${waypointName} in namespace ${namespace}`);
  const gateway = new K8sGateway();
  gateway.metadata = {
    name: waypointName,
    namespace,
    labels: {
      ...labels,
      ...(pkg.metadata?.labels || {}),
    },
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

  log.debug(`Applying Waypoint Gateway resource`, {
    namespace,
    waypointName,
    spec: JSON.stringify(gateway.spec),
  });

  try {
    await K8s(K8sGateway).Apply(gateway, { force: true });
    log.info(`Successfully applied Waypoint Gateway: ${waypointName}`, { namespace });
  } catch (error) {
    log.error(`Failed to apply Waypoint Gateway ${waypointName}`, {
      namespace,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }

  log.info(`Waiting for Waypoint Gateway ${waypointName} to become ready`, { namespace });
  return waitForWaypointReady(waypointName, namespace!);
}

/**
 * Creates a RequestAuthentication resource for the waypoint
 * @param pkg - The UDS package to create the authentication for
 * @param waypointName - The name of the waypoint gateway
 * @param clientId - The OIDC client ID to authenticate
 * @returns A promise that resolves when the RequestAuthentication is created
 * @throws Error if the waypoint doesn't exist or creation fails
 */
export async function createRequestAuthentication(
  pkg: UDSPackage,
  waypointName: string,
  clientId: string,
): Promise<void> {
  const { namespace, name } = pkg.metadata!;

  await verifyWaypointExists(namespace!, waypointName);

  const ra = new IstioRequestAuthentication();
  ra.metadata = {
    name: `${name}-jwt`,
    namespace,
  };

  ra.spec = {
    targetRef: {
      kind: "Gateway",
      group: "gateway.networking.k8s.io",
      name: waypointName,
    },
    jwtRules: [
      {
        issuer: `https://${UDSConfig.domain}/realms/uds`,
        jwksUri: `http://keycloak-http.keycloak.svc.cluster.local:8080/realms/uds/protocol/openid-connect/certs`,
        audiences: [clientId],
      },
    ],
  };

  await K8s(IstioRequestAuthentication).Apply(ra, { force: true });
}

/**
 * Creates a Deny AuthorizationPolicy for the waypoint
 * @param pkg - The UDS package to create the policy for
 * @param waypointName - The name of the waypoint gateway
 * @returns A promise that resolves when the policy is created
 * @throws Error if the waypoint doesn't exist or creation fails
 */
export async function createDenyPolicy(pkg: UDSPackage, waypointName: string): Promise<void> {
  const namespace = pkg.metadata!.namespace;

  await verifyWaypointExists(namespace!, waypointName);

  const policy = new IstioAuthorizationPolicy();
  policy.metadata = {
    name: `deny-unauth-${pkg.metadata?.name}`,
    namespace: namespace!,
  };

  policy.spec = {
    action: Action.Deny,
    targetRef: {
      kind: "Gateway",
      group: "gateway.networking.k8s.io",
      name: waypointName,
    },
    rules: [
      {
        from: [
          {
            source: {
              notRequestPrincipals: [`https://${UDSConfig.domain}/realms/uds/*`],
            },
          },
        ],
      },
    ],
  };

  await K8s(IstioAuthorizationPolicy).Apply(policy, { force: true });
}

/**
 * Creates an AuthorizationPolicy to allow authentication requests to Keycloak
 * @param pkg - The UDS package to create the policy for
 * @param waypointName - The name of the waypoint gateway
 * @returns A promise that resolves when the policy is created
 * @throws Error if the waypoint doesn't exist or creation fails
 */
export async function createAuthServicePolicy(
  pkg: UDSPackage,
  waypointName: string,
): Promise<void> {
  const { namespace, name } = pkg.metadata!;

  await verifyWaypointExists(namespace!, waypointName);

  const policy = new IstioAuthorizationPolicy();
  policy.metadata = {
    name: `authservice-${name}`,
    namespace,
  };

  policy.spec = {
    action: Action.Custom,
    provider: {
      name: "authservice",
    },
    targetRef: {
      kind: "Gateway",
      group: "gateway.networking.k8s.io",
      name: waypointName,
    },
    rules: [
      {
        to: [
          {
            operation: {
              notPaths: ["/stats/prometheus"],
              notPorts: ["15020"],
            },
          },
        ],
        when: [
          {
            key: "request.headers[authorization]",
            notValues: ["*"],
          },
        ],
      },
    ],
  };

  await K8s(IstioAuthorizationPolicy).Apply(policy, { force: true });
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

/**
 * Registers a package for ambient waypoint handling
 * @param pkg - The UDS package to register
 * @returns A promise that resolves when registration is complete
 */
export async function registerAmbientPackage(pkg: UDSPackage): Promise<void> {
  const key = getPackageKey(pkg);
  const selectors =
    pkg.spec?.sso
      ?.filter(s => s.enableAuthserviceSelector)
      .map(s => s.enableAuthserviceSelector || {}) || [];

  const waypointName = `${pkg.metadata?.namespace}-${pkg.metadata?.name}-waypoint`;
  ambientPackages.set(key, { pkg, selectors, waypointName });

  // Reconcile existing services and pods
  try {
    // Reconcile services
    const services = await K8s(a.Service)
      .InNamespace(pkg.metadata?.namespace || "")
      .Get();
    for (const svc of services.items || []) {
      await reconcileService(svc);
    }

    // Reconcile pods
    const pods = await K8s(a.Pod)
      .InNamespace(pkg.metadata?.namespace || "")
      .Get();
    for (const pod of pods.items || []) {
      await reconcilePod(pod);
    }
  } catch (error) {
    log.error(`Error reconciling existing resources for package ${key}`, { error });
  }
}

/**
 * Waits for a waypoint gateway to become ready
 * @param name - The name of the waypoint gateway
 * @param namespace - The namespace of the waypoint gateway
 * @param options - Configuration options
 * @param options.maxAttempts - Maximum number of attempts (default: 30)
 * @param options.intervalMs - Interval between attempts in milliseconds (default: 1000)
 * @returns A promise that resolves with the waypoint name when ready
 * @throws Error if the waypoint doesn't become ready within the specified attempts
 */
async function waitForWaypointReady(
  name: string,
  namespace: string,
  options: { maxAttempts?: number; intervalMs?: number } = {},
): Promise<string> {
  const { maxAttempts = 10, intervalMs = 2000 } = options;
  log.info(`Waiting for Waypoint Gateway ${name} in namespace ${namespace} to become ready`, {
    maxAttempts,
    intervalMs,
  });

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const attemptStartTime = Date.now();
    try {
      log.debug(`Attempt ${attempt}/${maxAttempts}: Checking if waypoint is ready`, {
        name,
        namespace,
      });
      const gateway = await verifyWaypointExists(namespace, name);

      if (isGatewayReady(gateway)) {
        log.info(`Waypoint Gateway ${name} is ready`, {
          namespace,
          attempt,
          totalTimeMs: Date.now() - attemptStartTime,
        });
        return name;
      }

      log.debug(`Waypoint Gateway ${name} exists but is not ready yet`, {
        namespace,
        attempt,
        conditions: gateway.status?.conditions,
      });
    } catch (error) {
      log.warn(`Attempt ${attempt}/${maxAttempts}: Error checking waypoint status`, {
        name,
        namespace,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    }

    if (attempt < maxAttempts) {
      log.debug(`Waiting ${intervalMs}ms before next attempt`, { name, namespace, attempt });
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
  }

  const errorMessage = `Timed out waiting for Waypoint Gateway ${name} in namespace ${namespace} to become ready after ${maxAttempts} attempts`;
  log.error(errorMessage, { name, namespace, maxAttempts, intervalMs });
  throw new Error(errorMessage);
}

/**
 * Sets up all resources needed for ambient waypoint functionality
 * @param pkg - The UDS package to set up the waypoint for
 * @param clientId - The OIDC client ID for authentication
 * @returns A promise that resolves when setup is complete
 * @throws Error if any part of the setup fails
 */
export async function setupAmbientWaypoint(pkg: UDSPackage, clientId: string): Promise<void> {
  const { namespace, name } = pkg.metadata!;
  log.info(`Starting ambient waypoint setup for package: ${namespace}/${name}`, { clientId });

  const waypointName = `${namespace}-${name}-waypoint`;
  const waypointKey = getWaypointKey(namespace!, waypointName);
  log.debug(`Generated waypoint name: ${waypointName}, key: ${waypointKey}`);

  try {
    log.info("Phase 1: Creating waypoint gateway");
    await createWaypointGateway(pkg);
    log.info("Waypoint gateway created, waiting for readiness");
    await waitForWaypointReady(waypointName, namespace!);
    log.info("Waypoint gateway is ready");

    await Promise.all([
      createRequestAuthentication(pkg, waypointName, clientId),
      createDenyPolicy(pkg, waypointName),
      createAuthServicePolicy(pkg, waypointName),
    ]);

    // Phase 2: Activation
    waypointReadiness.set(waypointKey, true);
    await registerAmbientPackage(pkg);
  } catch (error) {
    waypointReadiness.delete(waypointKey);
    log.error(`Failed to set up ambient waypoint for ${namespace}/${name}`, { error });
    throw error;
  }
}

/**
 * Unregisters a package for ambient waypoint handling
 * @param pkg - The UDS package to unregister
 * @returns A promise that resolves when unregistration is complete
 */
export async function unregisterAmbientPackage(pkg: UDSPackage): Promise<void> {
  const { namespace, name } = pkg.metadata!;

  const waypointName = `${name}-waypoint`;
  const waypointKey = getWaypointKey(namespace!, waypointName);
  const packageKey = getPackageKey(pkg);

  try {
    // Clean up waypoint resources
    const cleanupTasks = [
      // Delete Gateway
      K8s(K8sGateway)
        .InNamespace(namespace!)
        .Delete(waypointName)
        .catch(error => {
          if (error?.status !== 404) throw error;
        }),

      // Delete RequestAuthentication
      K8s(IstioRequestAuthentication)
        .InNamespace(namespace!)
        .Delete(`${name}-jwt`)
        .catch(error => {
          if (error?.status !== 404) throw error;
        }),

      // Delete AuthorizationPolicies
      Promise.all(
        [`${name}-deny-unauth`, `${name}-authservice`].map(policy =>
          K8s(IstioAuthorizationPolicy)
            .InNamespace(namespace!)
            .Delete(policy)
            .catch(error => {
              if (error?.status !== 404) throw error;
            }),
        ),
      ),
    ];

    await Promise.all(cleanupTasks);

    // Clean up in-memory state
    waypointReadiness.delete(waypointKey);
    ambientPackages.delete(packageKey);
  } catch (error) {
    log.error(`Failed to clean up ambient waypoint resources for ${packageKey}`, { error });
    throw error;
  }
}

export async function reconcileService(svc: a.Service): Promise<void> {
  const namespace = svc.metadata?.namespace;
  if (!namespace) return;

  for (const [, { pkg, selectors, waypointName }] of ambientPackages) {
    if (pkg.metadata?.namespace !== namespace) continue;

    if (serviceMatchesSelectors(svc, selectors)) {
      if (svc.metadata?.labels?.["istio.io/use-waypoint"] !== waypointName) {
        svc.metadata = {
          ...(svc.metadata || {}),
          labels: {
            ...(svc.metadata?.labels || {}),
            "istio.io/use-waypoint": waypointName,
            "istio.io/ingress-use-waypoint": "true",
          },
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
      if (pod.metadata?.labels?.["istio.io/use-waypoint"] !== waypointName) {
        pod.metadata = {
          ...(pod.metadata || {}),
          labels: {
            ...(pod.metadata?.labels || {}),
            "istio.io/use-waypoint": waypointName,
          },
        };
      }
      return;
    }
  }
}
