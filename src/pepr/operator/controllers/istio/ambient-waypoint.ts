/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { a, K8s, kind } from "pepr";
import { K8sGateway, K8sGatewayFromType, UDSPackage } from "../../crd";
import { Mode, Sso } from "../../crd/generated/package-v1alpha1";
import { PackageStore } from "../packages/package-store";
import { getAuthserviceClients, getOwnerRef } from "../utils";
import {
  ambientEgressNamespace,
  getSharedAnnotationKey,
  log,
  sharedEgressPkgId,
} from "./istio-resources";
import { getWaypointName, matchesLabels, serviceMatchesSelector } from "./waypoint-utils";

export const egressWaypointName = "egress-waypoint";

// Constants for labels and configuration
const ISTIO_WAYPOINT_LABEL = "istio.io/use-waypoint"; // Label to enable waypoint injection
const UDS_MANAGED_LABEL = "uds/managed-by"; // Label to identify UDS-managed resources

// Environment variables with defaults for waypoint health checking
const HEALTH_OPTS = {
  intervalMs: 5000,
  timeoutMs: 60000,
};

/**
 * Sets up an ambient waypoint for a package
 */
export async function setupAmbientWaypoint(pkg: UDSPackage, client: Sso): Promise<void> {
  const { namespace, name } = pkg.metadata || {};
  if (!namespace || !name) {
    const error = "Package metadata is missing namespace or name";
    log.error({ pkg }, error);
    throw new Error(error);
  }

  log.info(`Starting ambient waypoint setup for package ${name} in ${namespace}`);

  const waypointId = client.clientId;
  const waypointName = getWaypointName(waypointId);

  try {
    await createWaypointGateway(pkg, waypointName);
    await waitForWaypointPodHealthy(namespace, waypointName);
    await reconcileExistingResources(pkg, client, waypointName);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error(
      { errorMessage },
      `Error in ambient waypoint setup for waypoint ${waypointName} in ${namespace}`,
    );
    throw error;
  }
}

/**
 * Creates a waypoint gateway for the given package
 */
export async function createWaypointGateway(pkg: UDSPackage, waypointName: string) {
  const { namespace, name } = pkg.metadata || {};
  if (!namespace || !name) throw new Error("Package metadata is missing namespace or name");

  log.info(`Creating waypoint gateway for package: ${namespace}/${name}`);

  try {
    const gateway = new K8sGateway();

    gateway.metadata = {
      name: waypointName,
      namespace,
      labels: {
        [UDS_MANAGED_LABEL]: "uds-operator",
        "app.kubernetes.io/component": "ambient-waypoint",
        "istio.io/waypoint-for": "all",
        "istio.io/gateway-name": waypointName,
        "uds/generation": (pkg.metadata?.generation ?? 0).toString(),
        "uds/package": pkg.metadata?.name ?? "unknown",
      },
      ownerReferences: getOwnerRef(pkg),
    };

    gateway.spec = {
      gatewayClassName: "istio-waypoint",
      listeners: [{ name: "mesh", port: 15008, protocol: "HBONE" }],
    };

    // Log the gateway object before applying
    log.info(
      {
        namespace,
        name: waypointName,
        gatewayClassName: gateway.spec.gatewayClassName,
        ownerReferences: JSON.stringify(gateway.metadata.ownerReferences),
      },
      "Applying waypoint gateway",
    );

    try {
      await K8s(K8sGateway).Apply(gateway);
      log.info({ namespace, waypointName }, "Successfully created waypoint gateway");
      return waypointName;
    } catch (applyError) {
      // Detailed logging of the apply error
      log.error(
        { namespace, waypointName, errorType: typeof applyError, errorDetails: applyError },
        "Error creating waypoint gateway",
      );

      throw new Error(
        `Failed to create waypoint gateway: ${applyError instanceof Error ? applyError.message : String(applyError)}`,
      );
    }
  } catch (error) {
    // Capture all error details
    log.error(
      { namespace, waypointName, errorDetails: error },
      "Failed to create waypoint gateway",
    );

    throw new Error(
      `Failed to create waypoint gateway: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Checks if a waypoint pod is healthy
 */
export async function isWaypointPodHealthy(
  namespace: string,
  waypointName: string,
): Promise<boolean> {
  try {
    const pods = await K8s(a.Pod)
      .InNamespace(namespace)
      .WithLabel(`istio.io/gateway-name=${waypointName}`)
      .Get();

    return (
      pods.items?.some(
        pod =>
          pod.status?.phase === "Running" && pod.status?.containerStatuses?.every(cs => cs.ready),
      ) ?? false
    );
  } catch (error) {
    log.warn(`Error checking waypoint pod health for ${waypointName} in ${namespace}:`, error);
    return false;
  }
}

/**
 * Waits for a waypoint pod to become healthy with retries
 */
export async function waitForWaypointPodHealthy(
  namespace: string,
  waypointName: string,
): Promise<void> {
  const start = Date.now();
  const { intervalMs, timeoutMs } = HEALTH_OPTS;
  let attempts = 0;

  while (true) {
    attempts++;
    const elapsed = Date.now() - start;

    if (elapsed >= timeoutMs) {
      throw new Error(
        `Timeout waiting for waypoint pod ${waypointName} in ${namespace} after ${elapsed}ms`,
      );
    }

    const isHealthy = await isWaypointPodHealthy(namespace, waypointName);
    if (isHealthy) {
      log.debug(
        `Waypoint pod ${waypointName} in ${namespace} is healthy after ${attempts} attempts and ${elapsed}ms`,
      );
      return;
    }

    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
}

/**
 * Reconciles a service to add waypoint labels
 */
export async function reconcileService(svc: a.Service): Promise<void> {
  const namespace = svc.metadata?.namespace;
  if (!namespace) {
    return;
  }

  // Ensure labels object exists
  if (!svc.metadata) {
    svc.metadata = {};
  }

  if (!svc.metadata.labels) {
    svc.metadata.labels = {};
  }

  // Skip if this is a waypoint service
  if (
    svc.metadata?.labels?.["app.kubernetes.io/component"] === "ambient-waypoint" &&
    svc.metadata?.labels?.["gateway.networking.k8s.io/gateway-name"]?.includes("waypoint")
  ) {
    return;
  }

  const pkg = PackageStore.getPackageByNamespace(namespace);
  if (
    !pkg ||
    pkg.metadata?.deletionTimestamp ||
    pkg.spec?.network?.serviceMesh?.mode !== Mode.Ambient
  ) {
    return;
  }

  // Find the SSO client that matches this service's selector (only authservice-enabled)
  const authClients = getAuthserviceClients(pkg);
  const matchingSso = authClients.find(sso =>
    serviceMatchesSelector(svc, sso.enableAuthserviceSelector!),
  );

  if (!matchingSso?.clientId) return;

  const waypointName = getWaypointName(matchingSso.clientId);

  svc.metadata.labels = {
    ...svc.metadata.labels,
    [ISTIO_WAYPOINT_LABEL]: waypointName,
    "istio.io/ingress-use-waypoint": "true",
  };

  log.info(
    { namespace, waypointName, clientId: matchingSso.clientId, labels: svc.metadata.labels },
    `Added waypoint labels to service ${svc.metadata?.name}`,
  );
}

/**
 * Reconciles a pod to add waypoint labels
 */
export async function reconcilePod(pod: a.Pod): Promise<void> {
  const namespace = pod.metadata?.namespace;
  if (!namespace) {
    return;
  }

  // Ensure labels object exists
  if (!pod.metadata) {
    pod.metadata = {};
  }

  if (!pod.metadata.labels) {
    pod.metadata.labels = {};
  }

  // Skip if this is a waypoint service
  if (
    pod.metadata?.labels?.["app.kubernetes.io/component"] === "ambient-waypoint" &&
    pod.metadata?.labels?.["gateway.networking.k8s.io/gateway-name"]?.includes("waypoint")
  ) {
    return;
  }

  const pkg = PackageStore.getPackageByNamespace(namespace);
  if (
    !pkg ||
    pkg.metadata?.deletionTimestamp ||
    pkg.spec?.network?.serviceMesh?.mode !== Mode.Ambient
  ) {
    return;
  }

  // Find the SSO client that matches this pod's labels (only authservice-enabled)
  const authClients = getAuthserviceClients(pkg);
  const matchingSso = authClients.find(sso =>
    matchesLabels(pod.metadata?.labels || {}, sso.enableAuthserviceSelector!),
  );

  if (!matchingSso?.clientId) return;

  const waypointName = getWaypointName(matchingSso.clientId);

  pod.metadata.labels = {
    ...pod.metadata.labels,
    [ISTIO_WAYPOINT_LABEL]: waypointName,
  };

  const podDisplayName = pod.metadata?.name || pod.metadata?.generateName || "<unknown name>";

  log.info(
    {
      namespace,
      waypointName,
      clientId: matchingSso.clientId,
    },
    `Added waypoint labels to pod ${podDisplayName}`,
  );
}

/**
 * Cleans up waypoint labels from pods and services that reference a specific waypoint
 */
export async function cleanupWaypointLabels(
  namespace: string,
  waypointName: string,
): Promise<void> {
  log.info(`Starting cleanup of waypoint labels: namespace=${namespace}, waypoint=${waypointName}`);

  try {
    // Clean up pods with the waypoint label
    await cleanupPodsWithWaypointLabel(namespace, waypointName);

    // Clean up services with the waypoint label
    await cleanupServicesWithWaypointLabel(namespace, waypointName);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error(
      {
        namespace,
        waypointName,
        error: errorMessage,
      },
      "Failed to clean up waypoint labels",
    );
    // Don't throw here to allow other cleanup to continue
  }
}

/**
 * Cleans up waypoint labels from pods
 */
async function cleanupPodsWithWaypointLabel(
  namespace: string,
  waypointName: string,
): Promise<void> {
  const pods = await K8s(a.Pod)
    .InNamespace(namespace)
    .WithLabel(ISTIO_WAYPOINT_LABEL, waypointName)
    .Get();

  await Promise.all(
    pods.items.map(async pod => {
      const podName = pod.metadata?.name;
      if (!podName) return;

      // Skip if pod is being deleted or doesn't have the label anymore
      if (pod.metadata?.deletionTimestamp) {
        log.debug({ namespace, podName }, "Skipping pod: marked for deletion");
        return;
      }

      try {
        await K8s(kind.Pod, {
          name: podName,
          namespace,
        }).Patch([
          {
            op: "remove",
            path: "/metadata/labels/istio.io~1use-waypoint",
          },
        ]);
        log.info({ namespace, podName, waypointName }, "Removed waypoint label from pod");
      } catch (error) {
        log.error(
          {
            namespace,
            podName,
            waypointName,
            error: error instanceof Error ? error.message : String(error),
          },
          "Failed to remove waypoint label from pod",
        );
      }
    }),
  );
}

/**
 * Cleans up waypoint labels from services
 */
async function cleanupServicesWithWaypointLabel(
  namespace: string,
  waypointName: string,
): Promise<void> {
  const services = await K8s(a.Service)
    .InNamespace(namespace)
    .WithLabel(ISTIO_WAYPOINT_LABEL, waypointName)
    .Get();

  await Promise.all(
    services.items.map(async svc => {
      const svcName = svc.metadata?.name;
      if (!svcName) return;

      // Skip if service is being deleted or doesn't have the label anymore
      if (svc.metadata?.deletionTimestamp) {
        log.debug({ namespace, svcName }, "Skipping service: marked for deletion");
        return;
      }

      try {
        await K8s(kind.Service, {
          name: svcName,
          namespace,
        }).Patch([
          {
            op: "remove",
            path: "/metadata/labels/istio.io~1ingress-use-waypoint",
          },
          {
            op: "remove",
            path: "/metadata/labels/istio.io~1use-waypoint",
          },
        ]);
        log.info({ namespace, svcName, waypointName }, "Removed waypoint labels from service");
      } catch (error) {
        log.error(
          {
            namespace,
            svcName,
            waypointName,
            error: error instanceof Error ? error.message : String(error),
          },
          "Failed to remove waypoint labels from service",
        );
      }
    }),
  );
}

export async function reconcileExistingResources(
  pkg: UDSPackage,
  ssoClient: Sso,
  waypointName: string,
): Promise<void> {
  const namespace = pkg.metadata?.namespace;
  if (!namespace) {
    log.warn({ pkg }, "No namespace found in package metadata");
    return;
  }

  log.info(`Starting reconciliation of existing resources in ${namespace} for ${waypointName}`);

  try {
    const [services, pods] = await Promise.all([
      K8s(kind.Service).InNamespace(namespace).Get(),
      K8s(kind.Pod).InNamespace(namespace).Get(),
    ]);

    const matchingServices = services.items.filter(svc =>
      serviceMatchesSelector(svc, ssoClient.enableAuthserviceSelector!),
    );

    const matchingPods = pods.items.filter(pod => {
      const matches = matchesLabels(
        pod.metadata?.labels || {},
        ssoClient.enableAuthserviceSelector!,
      );
      return matches;
    });

    log.debug(`Found resource to update with waypoint labels in ${namespace}`);

    // Process matching services
    for (const svc of matchingServices) {
      try {
        await K8s(kind.Service, {
          name: svc.metadata!.name!,
          namespace: namespace,
        }).Patch([
          {
            op: "add",
            path: "/metadata/labels/istio.io~1ingress-use-waypoint",
            value: "true",
          },
          {
            op: "add",
            path: `/metadata/labels/${ISTIO_WAYPOINT_LABEL.replace(/\//g, "~1")}`,
            value: waypointName,
          },
        ]);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        log.error({ errorMessage }, `Service reconciliation failed for ${namespace}`);
      }
    }

    // Process matching pods
    for (const pod of matchingPods) {
      try {
        await K8s(kind.Pod, {
          name: pod.metadata!.name!,
          namespace: namespace,
        }).Patch([
          {
            op: "add",
            path: `/metadata/labels/${ISTIO_WAYPOINT_LABEL.replace(/\//g, "~1")}`,
            value: waypointName,
          },
        ]);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        log.info({ errorMessage }, `Pod reconciliation failed for ${namespace}`);
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error({ errorMessage }, `Error in reconcileExistingResources()`);

    // Re-throw to allow the caller to handle the error
    throw error;
  }
}

// Generate Waypoint for ambient egress
export function createEgressWaypointGateway(pkgs: Set<string>, generation: number) {
  // Add annotations from resource
  const annotations: Record<string, string> = {};
  for (const pkgId of pkgs) {
    annotations[`${getSharedAnnotationKey(pkgId)}`] = "user";
  }

  // Waypoint resource
  const waypoint: K8sGateway = {
    metadata: {
      name: egressWaypointName,
      namespace: ambientEgressNamespace,
      annotations,
      labels: {
        "uds/package": sharedEgressPkgId,
        "uds/generation": generation.toString(),
        "istio.io/gateway-name": egressWaypointName,
      },
    },
    spec: {
      gatewayClassName: "istio-waypoint",
      listeners: [
        {
          name: "mesh",
          port: 15008,
          protocol: "HBONE",
          allowedRoutes: {
            namespaces: {
              from: K8sGatewayFromType.All,
            },
            kinds: [
              {
                group: "networking.istio.io",
                kind: "ServiceEntry",
              },
            ],
          },
        },
      ],
      infrastructure: {
        parametersRef: {
          group: "",
          kind: "ConfigMap",
          name: "egress-waypoint-config",
        },
      },
    },
  };

  return waypoint;
}
