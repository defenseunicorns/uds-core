/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { V1OwnerReference } from "@kubernetes/client-node";
import { K8s, kind } from "pepr";
import { Component, setupLogger } from "../../../logger";
import {
  Direction,
  K8sGateway,
  K8sGatewayFromType,
  K8sUDPRoute,
  RemoteProtocol,
  UDSPackage,
} from "../../crd";
import { ParentRefElement } from "../../crd/generated/k8s/udproute-v1alpha2";
import { Expose, ExposeProtocol, StatusEnum } from "../../crd/generated/package-v1alpha1";
import { UDSConfig } from "../config/config";
import { generate } from "../network/generate";
import { validateNamespace, getOwnerRef, purgeOrphans, sanitizeResourceName } from "../utils";

export const envoyDefaultGatewayName = "envoy-default-gateway";
export const envoyDefaultGatewayNamespace = "envoy-default-gateway";

const log = setupLogger(Component.OPERATOR_RECONCILERS);

type GatewayTarget = {
  name: string;
  namespace: string;
  defaultMode: boolean;
};

type UdpExposeEntry = {
  expose: Expose;
};

export type EnvoyGatewayResourceResult = {
  networkPolicies: kind.NetworkPolicy[];
  defaultDisabled: boolean;
  portConflict: boolean;
};

let defaultGatewayReconcileInFlight: Promise<void> | null = null;
let defaultGatewayReconcileDirty = false;

export function hasDefaultModeUDPExpose(pkg: UDSPackage): boolean {
  return getUDPExposeEntries(pkg).some(({ expose }) => resolveGatewayTarget(expose).defaultMode);
}

export function getUDPExposeEntries(pkg: UDSPackage): UdpExposeEntry[] {
  return (pkg.spec?.network?.expose ?? [])
    .map(expose => ({ expose }))
    .filter(({ expose }) => expose.protocol === ExposeProtocol.UDP);
}

export async function envoyGatewayResources(
  pkg: UDSPackage,
  namespace: string,
): Promise<EnvoyGatewayResourceResult> {
  const pkgName = pkg.metadata?.name;
  if (!pkgName) {
    throw new Error("Package metadata.name is required");
  }

  const generation = (pkg.metadata?.generation ?? 0).toString();
  const ownerRefs = getOwnerRef(pkg);
  const udpEntries = getUDPExposeEntries(pkg);
  const networkPolicies: kind.NetworkPolicy[] = [];
  let defaultDisabled = false;
  let portConflict = false;
  let defaultGatewayEnabled: boolean | undefined;
  let allPackages: UDSPackage[] | undefined;

  const getDefaultGatewayEnabled = async () => {
    defaultGatewayEnabled ??= await isEnvoyGatewayDefaultEnabled();
    return defaultGatewayEnabled;
  };

  const getAllPackages = async () => {
    allPackages ??= (await K8s(UDSPackage).Get()).items;
    return allPackages;
  };

  if (udpEntries.length === 0) {
    const hasGeneratedUDPResources =
      (await hasGeneratedUDPRoutes(namespace, pkgName)) ||
      (await hasGeneratedUDPNetworkPolicies(namespace, pkgName));

    if (!hasGeneratedUDPResources) {
      return { networkPolicies, defaultDisabled, portConflict };
    }
  }

  for (const entry of udpEntries) {
    const targetGateway = resolveGatewayTarget(entry.expose);

    if (targetGateway.defaultMode) {
      if (!(await getDefaultGatewayEnabled())) {
        defaultDisabled = true;
        continue;
      }
      if (isLosingDefaultPortConflict(pkg, entry.expose, await getAllPackages())) {
        portConflict = true;
        continue;
      }
    } else {
      await validateNamespace(targetGateway.namespace);
    }

    const udpRoute = generateUDPRoute(pkg, namespace, entry, generation, ownerRefs, targetGateway);
    log.debug(
      udpRoute,
      `Applying UDPRoute ${udpRoute.metadata?.namespace}/${udpRoute.metadata?.name}`,
    );
    await K8s(K8sUDPRoute).Apply(udpRoute, { force: true });

    const networkPolicy = generateUDPIngressNetworkPolicy(namespace, entry.expose, targetGateway);
    addPackageLabels(networkPolicy, pkgName, generation, ownerRefs);
    log.debug(
      networkPolicy,
      `Applying UDP ingress NetworkPolicy ${networkPolicy.metadata?.namespace}/${networkPolicy.metadata?.name}`,
    );
    await K8s(kind.NetworkPolicy).Apply(networkPolicy, { force: true });
    networkPolicies.push(networkPolicy);
  }

  await purgeOrphans(generation, namespace, pkgName, K8sUDPRoute, log);
  await purgeOrphans(generation, namespace, pkgName, kind.NetworkPolicy, log, {
    "uds/managed-by": "envoy-gateway",
  });

  if (await getDefaultGatewayEnabled()) {
    await reconcileDefaultGatewayListeners(allPackages);
  }

  return { networkPolicies, defaultDisabled, portConflict };
}

export async function reconcileDefaultGatewayListeners(packages?: UDSPackage[]): Promise<void> {
  if (defaultGatewayReconcileInFlight) {
    defaultGatewayReconcileDirty = true;
    await defaultGatewayReconcileInFlight;
    return;
  }

  defaultGatewayReconcileDirty = true;
  defaultGatewayReconcileInFlight = (async () => {
    while (defaultGatewayReconcileDirty) {
      defaultGatewayReconcileDirty = false;
      await performDefaultGatewayReconciliation(packages);
    }
  })();

  try {
    await defaultGatewayReconcileInFlight;
  } finally {
    defaultGatewayReconcileInFlight = null;
  }
}

export function getEnvoyGatewayStatusConditions(result: EnvoyGatewayResourceResult) {
  if (result.defaultDisabled) {
    return [
      {
        type: "Ready",
        status: StatusEnum.False,
        lastTransitionTime: new Date(),
        message: "Envoy Gateway default Gateway is not enabled for UDP expose entries.",
        reason: "EnvoyGatewayDefaultDisabled",
      },
    ];
  }

  if (result.portConflict) {
    return [
      {
        type: "Ready",
        status: StatusEnum.False,
        lastTransitionTime: new Date(),
        message:
          "A UDP expose entry conflicts with an earlier package using the same Gateway port.",
        reason: "UDPPortConflict",
      },
    ];
  }

  return undefined;
}

function resolveGatewayTarget(expose: Expose): GatewayTarget {
  if (expose.gateway) {
    return { name: expose.gateway, namespace: expose.gateway, defaultMode: false };
  }

  return {
    name: envoyDefaultGatewayName,
    namespace: envoyDefaultGatewayNamespace,
    defaultMode: true,
  };
}

function generateUDPRoute(
  pkg: UDSPackage,
  namespace: string,
  entry: UdpExposeEntry,
  generation: string,
  ownerRefs: V1OwnerReference[],
  targetGateway: GatewayTarget,
): K8sUDPRoute {
  const expose = entry.expose;
  const pkgName = pkg.metadata!.name!;
  const routeName = sanitizeResourceName(`${pkgName}-udp-${expose.description ?? expose.port}`);
  const parentRef: ParentRefElement = {
    name: targetGateway.name,
    namespace: targetGateway.namespace,
  };

  if (targetGateway.defaultMode) {
    parentRef.sectionName = `udp-${expose.port}`;
  }

  return {
    apiVersion: "gateway.networking.k8s.io/v1alpha2",
    kind: "UDPRoute",
    metadata: {
      name: routeName,
      namespace,
      labels: {
        "uds/package": pkgName,
        "uds/generation": generation,
      },
      ownerReferences: ownerRefs,
    },
    spec: {
      parentRefs: [parentRef],
      rules: [
        {
          backendRefs: [
            {
              name: expose.service!,
              port: expose.port,
            },
          ],
        },
      ],
    },
  };
}

function generateUDPIngressNetworkPolicy(
  namespace: string,
  expose: Expose,
  targetGateway: GatewayTarget,
): kind.NetworkPolicy {
  return generate(namespace, {
    direction: Direction.Ingress,
    selector: expose.selector ?? {},
    remoteNamespace: targetGateway.namespace,
    remoteSelector: {
      "gateway.envoyproxy.io/owning-gateway-name": targetGateway.name,
    },
    port: expose.targetPort ?? expose.port,
    remoteProtocol: RemoteProtocol.UDP,
    description: `${expose.targetPort ?? expose.port}-${Object.values(expose.selector ?? {}).join("-")} Envoy Gateway ${targetGateway.name}`,
  });
}

function addPackageLabels(
  networkPolicy: kind.NetworkPolicy,
  pkgName: string,
  generation: string,
  ownerRefs: V1OwnerReference[],
) {
  networkPolicy.metadata = networkPolicy.metadata ?? {};
  networkPolicy.metadata.labels = {
    ...networkPolicy.metadata.labels,
    "uds/package": pkgName,
    "uds/generation": generation,
    "uds/managed-by": "envoy-gateway",
  };
  networkPolicy.metadata.ownerReferences = ownerRefs;
}

async function hasGeneratedUDPNetworkPolicies(
  namespace: string,
  pkgName: string,
): Promise<boolean> {
  const policies = await K8s(kind.NetworkPolicy)
    .InNamespace(namespace)
    .WithLabel("uds/package", pkgName)
    .WithLabel("uds/managed-by", "envoy-gateway")
    .Get();

  return policies.items.length > 0;
}

async function hasGeneratedUDPRoutes(namespace: string, pkgName: string): Promise<boolean> {
  const udpRoutes = await K8s(K8sUDPRoute)
    .InNamespace(namespace)
    .WithLabel("uds/package", pkgName)
    .Get();

  return udpRoutes.items.length > 0;
}

export async function isEnvoyGatewayDefaultEnabled(): Promise<boolean> {
  if (UDSConfig.isEnvoyGatewayDefaultEnabled) {
    return true;
  }

  try {
    await K8s(UDSPackage).InNamespace("envoy-gateway-system").Get("envoy-gateway");
    UDSConfig.isEnvoyGatewayDefaultEnabled = true;
    return true;
  } catch (e) {
    if (e?.status !== 404) {
      throw e;
    }
    return false;
  }
}

async function performDefaultGatewayReconciliation(packages?: UDSPackage[]): Promise<void> {
  const listenerEntries = await getWinningDefaultListenerEntries(packages);

  if (listenerEntries.length === 0) {
    try {
      await K8s(K8sGateway).Delete({
        apiVersion: "gateway.networking.k8s.io/v1",
        kind: "Gateway",
        metadata: { name: envoyDefaultGatewayName, namespace: envoyDefaultGatewayNamespace },
      });
    } catch (e) {
      if (e?.status !== 404) {
        throw e;
      }
    }
    return;
  }

  await K8s(kind.Namespace).Apply({
    apiVersion: "v1",
    kind: "Namespace",
    metadata: { name: envoyDefaultGatewayNamespace },
  });

  await K8s(K8sGateway).Apply(
    {
      apiVersion: "gateway.networking.k8s.io/v1",
      kind: "Gateway",
      metadata: {
        name: envoyDefaultGatewayName,
        namespace: envoyDefaultGatewayNamespace,
      },
      spec: {
        gatewayClassName: "envoy-gateway",
        listeners: listenerEntries.map(({ expose, namespace }) => ({
          name: `udp-${expose.port}`,
          protocol: "UDP",
          port: expose.port!,
          allowedRoutes: {
            namespaces: {
              from: K8sGatewayFromType.Selector,
              selector: {
                matchLabels: {
                  "kubernetes.io/metadata.name": namespace,
                },
              },
            },
          },
        })),
      },
    },
    { force: true },
  );
}

async function getWinningDefaultListenerEntries(
  packages?: UDSPackage[],
): Promise<{ pkg: UDSPackage; expose: Expose; namespace: string }[]> {
  const packageItems = packages ?? (await K8s(UDSPackage).Get()).items;
  const entries = packageItems.flatMap(pkg =>
    pkg.metadata?.deletionTimestamp
      ? []
      : getUDPExposeEntries(pkg)
          .filter(({ expose }) => resolveGatewayTarget(expose).defaultMode)
          .map(({ expose }) => ({ pkg, expose, namespace: pkg.metadata!.namespace! })),
  );

  const winners = new Map<number, { pkg: UDSPackage; expose: Expose; namespace: string }>();

  for (const entry of entries) {
    const currentWinner = winners.get(entry.expose.port!);
    if (!currentWinner || comparePackagePrecedence(entry.pkg, currentWinner.pkg) < 0) {
      winners.set(entry.expose.port!, entry);
    }
  }

  return [...winners.values()].sort((a, b) => a.expose.port! - b.expose.port!);
}

function isLosingDefaultPortConflict(
  pkg: UDSPackage,
  expose: Expose,
  packages: UDSPackage[],
): boolean {
  const conflictingPackages = packages.filter(
    otherPkg =>
      !otherPkg.metadata?.deletionTimestamp &&
      getUDPExposeEntries(otherPkg).some(
        entry =>
          resolveGatewayTarget(entry.expose).defaultMode && entry.expose.port === expose.port,
      ),
  );
  const winner = conflictingPackages.sort(comparePackagePrecedence)[0];

  return winner !== undefined && winner.metadata?.uid !== pkg.metadata?.uid;
}

function comparePackagePrecedence(a: UDSPackage, b: UDSPackage): number {
  const aCreated = normalizeTimestamp(a.metadata?.creationTimestamp);
  const bCreated = normalizeTimestamp(b.metadata?.creationTimestamp);
  if (aCreated !== bCreated) {
    return aCreated.localeCompare(bCreated);
  }

  return (a.metadata?.uid ?? "").localeCompare(b.metadata?.uid ?? "");
}

function normalizeTimestamp(timestamp: Date | string | undefined): string {
  if (timestamp instanceof Date) {
    return timestamp.toISOString();
  }

  return timestamp ?? "";
}
