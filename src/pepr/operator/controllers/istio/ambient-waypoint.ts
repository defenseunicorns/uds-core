/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { V1LabelSelector } from "@kubernetes/client-node";
import { a, K8s } from "pepr";
import { K8sGateway, UDSPackage } from "../../crd";
import { Mode } from "../../crd/generated/package-v1alpha1";
import { generateWaypointAuthPolicies } from "../network/authorizationPolicies";
import { PackageStore } from "../packages/package-store";
import { getOwnerRef } from "../utils";
import { log } from "./istio-resources";
import {
  createNetworkPolicy,
  getWaypointName,
  matchesLabels,
  serviceMatchesSelector,
  shouldUseAmbientWaypoint,
} from "./waypoint-utils";

// Constants for labels and configuration
const ISTIO_WAYPOINT_LABEL = "istio.io/use-waypoint"; // Label to enable waypoint injection
const UDS_MANAGED_LABEL = "uds/managed-by"; // Label to identify UDS-managed resources

// Environment variables with defaults for waypoint health checking
const HEALTH_OPTS = {
  maxAttempts: parseInt(process.env.WAYPOINT_HEALTH_MAX_ATTEMPTS || "10", 10),
  intervalMs: parseInt(process.env.WAYPOINT_HEALTH_INTERVAL_MS || "5000", 10),
  timeoutMs: parseInt(process.env.WAYPOINT_HEALTH_TIMEOUT_MS || "60000", 10),
};

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
    log.info("Creating waypoint gateway", { namespace, package: name, waypointId, waypointName });
    await createWaypointGateway(pkg, waypointName, waypointId);

    log.info("Waiting for waypoint pod to become healthy", { namespace, waypointName });
    await waitForWaypointPodHealthy(namespace, waypointName);

    // Get all SSO clients with enableAuthserviceSelector
    const ssoClients = pkg.spec?.sso?.filter(s => s.enableAuthserviceSelector) || [];

    // Find the SSO client that matches this waypoint
    const ssoClient = ssoClients.find(sso => {
      const clientWaypointName = sso.clientId ? getWaypointName(sso.clientId) : null;
      return clientWaypointName === waypointName;
    });

    if (ssoClient?.enableAuthserviceSelector) {
      log.info("Generating waypoint network policies", {
        namespace,
        waypointName,
        clientId: ssoClient.clientId,
        appSelector: ssoClient.enableAuthserviceSelector,
      });

      await generateWaypointNetworkPolicies(pkg, waypointName, ssoClient.enableAuthserviceSelector);

      log.info("Generating waypoint authorization policies", {
        namespace,
        waypointName,
        clientId: ssoClient.clientId,
      });

      await generateWaypointAuthPolicies(pkg, waypointName, ssoClient.enableAuthserviceSelector);
    } else {
      log.warn("No matching SSO client found for waypoint", {
        waypointName,
        ssoClients: ssoClients.map(s => s.clientId),
      });
    }

    log.info("Successfully set up ambient waypoint", { namespace, package: name, waypointName });
  } catch (error) {
    // Capture detailed error information
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    log.error("Failed to set up ambient waypoint", {
      namespace,
      package: name,
      waypointName,
      error: errorMessage,
      stack: errorStack,
    });

    // Throw a more descriptive error
    throw new Error(`Failed to set up ambient waypoint: ${errorMessage}`);
  }
}

/**
 * Creates a waypoint gateway for the given package
 * @param pkg - The UDS package
 * @param waypointId - The ID for the waypoint
 * @returns Promise resolving to the waypoint name
 */
export async function createWaypointGateway(
  pkg: UDSPackage,
  waypointName: string,
  waypointId: string,
) {
  const { namespace, name } = pkg.metadata || {};
  if (!namespace || !name) throw new Error("Package metadata is missing namespace or name");

  log.info(`Creating waypoint gateway for package: ${namespace}/${name}`, {
    waypointName,
    waypointId,
    namespace,
    packageName: name,
  });

  try {
    // First check if the gateway already exists
    try {
      const existingGateway = await K8s(K8sGateway).InNamespace(namespace).Get(waypointName);
      if (existingGateway) {
        log.info(`Waypoint gateway ${waypointName} already exists in namespace ${namespace}`);
        return waypointName;
      }
    } catch {
      // Gateway doesn't exist, which is expected
      log.info(`Waypoint gateway ${waypointName} does not exist yet, creating it`);
    }

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

    // Log the gateway object before applying
    log.info("Applying waypoint gateway", {
      namespace,
      name: waypointName,
      gatewayClassName: gateway.spec.gatewayClassName,
      ownerReferences: JSON.stringify(gateway.metadata.ownerReferences),
    });

    try {
      // Use Create instead of Apply to get more specific error messages
      await K8s(K8sGateway).Create(gateway);
      log.info("Successfully created waypoint gateway", { namespace, waypointName });
      return waypointName;
    } catch (applyError) {
      // Detailed logging of the apply error
      log.error("Error creating waypoint gateway", {
        namespace,
        waypointName,
        errorType: typeof applyError,
        errorDetails: applyError,
      });

      throw new Error(
        `Failed to create waypoint gateway: ${applyError instanceof Error ? applyError.message : String(applyError)}`,
      );
    }
  } catch (error) {
    // Capture all error details
    log.error("Failed to create waypoint gateway", {
      namespace,
      waypointName,
      errorDetails: error,
    });

    throw new Error(
      `Failed to create waypoint gateway: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
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
    // Health check policy: Allow monitoring access to waypoint
    createNetworkPolicy(`allow-${waypointName}-ingress-health`, namespace, pkg, {
      podSelector: waypointSelector,
      ingress: [
        {
          from: [
            {
              namespaceSelector: {
                matchLabels: { "kubernetes.io/metadata.name": "monitoring" },
              },
              podSelector: {
                matchLabels: { "app.kubernetes.io/name": "prometheus" },
              },
            },
          ],
          ports: [
            { port: 15020, protocol: "TCP" }, // Envoy admin port
            { port: 15008, protocol: "TCP" }, // HBONE port
          ],
        },
      ],
      policyTypes: ["Ingress"],
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

  log.info("Starting waypoint pod health check", {
    namespace,
    waypointName,
    maxAttempts,
    intervalMs,
    timeoutMs,
  });

  for (let i = 1; i <= maxAttempts; i++) {
    if (Date.now() - start > timeoutMs) {
      log.error("Timeout waiting for waypoint pod", {
        namespace,
        waypointName,
        elapsedMs: Date.now() - start,
      });
      throw new Error(`Timeout waiting for waypoint pod ${waypointName} in ${namespace}`);
    }

    try {
      // Check if pods exist with the waypoint label
      const pods = await K8s(a.Pod)
        .InNamespace(namespace)
        .WithLabel(`istio.io/gateway-name=${waypointName}`)
        .Get();

      if (!pods.items || pods.items.length === 0) {
        log.info(
          `No waypoint pods found for ${waypointName} in ${namespace}, attempt ${i}/${maxAttempts}`,
        );
      } else {
        log.info(
          `Found ${pods.items.length} waypoint pods for ${waypointName} in ${namespace}, checking health...`,
        );

        // Log pod status for debugging
        pods.items.forEach(pod => {
          log.info(`Pod status: ${pod.metadata?.name}`, {
            phase: pod.status?.phase,
            ready: pod.status?.containerStatuses?.every(cs => cs.ready),
            conditions: pod.status?.conditions,
          });
        });

        if (await isWaypointPodHealthy(namespace, waypointName)) {
          log.info(`Waypoint pod ${waypointName} in ${namespace} is healthy`);
          return;
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.warn(`Error checking waypoint pod health (attempt ${i}/${maxAttempts})`, {
        namespace,
        waypointName,
        error: errorMessage,
      });
    }

    if (i < maxAttempts) {
      log.info(`Waiting for waypoint pod to become healthy, attempt ${i}/${maxAttempts}`);
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
  }

  log.error(
    `Waypoint pod ${waypointName} in ${namespace} did not become healthy after ${maxAttempts} attempts`,
  );
  throw new Error(
    `Waypoint pod ${waypointName} in ${namespace} did not become healthy after ${maxAttempts} attempts`,
  );
}

/**
 * Reconciles a service to add waypoint labels
 * @param svc - The service to reconcile
 */
export async function reconcileService(svc: a.Service): Promise<void> {
  const namespace = svc.metadata?.namespace;
  if (!namespace || !svc.metadata?.labels) return;

  const pkg = PackageStore.getPackageByNamespace(namespace);
  if (!pkg || pkg.spec?.network?.serviceMesh?.mode !== Mode.Ambient) return;

  // Find the SSO client that matches this service's selector
  const matchingSso = pkg.spec?.sso?.find(sso => {
    if (!sso.enableAuthserviceSelector) return false;
    return serviceMatchesSelector(svc, sso.enableAuthserviceSelector);
  });

  if (!matchingSso?.clientId) return;

  const waypointName = getWaypointName(matchingSso.clientId);

  svc.metadata.labels = {
    ...svc.metadata.labels,
    [ISTIO_WAYPOINT_LABEL]: waypointName,
    "istio.io/ingress-use-waypoint": "true",
  };

  log.info(`Added waypoint labels to service ${svc.metadata?.name}`, {
    namespace,
    waypointName,
    clientId: matchingSso.clientId,
  });
}

/**
 * Reconciles a pod to add waypoint labels
 * @param pod - The pod to reconcile
 */
export async function reconcilePod(pod: a.Pod): Promise<void> {
  const namespace = pod.metadata?.namespace;
  if (!namespace || !pod.metadata?.labels) return;

  const pkg = PackageStore.getPackageByNamespace(namespace);
  if (!pkg || pkg.spec?.network?.serviceMesh?.mode !== Mode.Ambient) return;

  // Find the SSO client that matches this pod's labels
  const matchingSso = pkg.spec?.sso?.find(sso => {
    if (!sso.enableAuthserviceSelector) return false;
    return matchesLabels(pod.metadata?.labels || {}, sso.enableAuthserviceSelector);
  });

  if (!matchingSso?.clientId) return;

  const waypointName = getWaypointName(matchingSso.clientId);

  pod.metadata.labels = {
    ...pod.metadata.labels,
    [ISTIO_WAYPOINT_LABEL]: waypointName,
  };

  log.info(`Added waypoint labels to pod ${pod.metadata?.name}`, {
    namespace,
    waypointName,
    clientId: matchingSso.clientId,
    labels: pod.metadata.labels,
  });
}
