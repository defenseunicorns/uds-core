/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { V1OwnerReference } from "@kubernetes/client-node";
import { K8s, kind } from "pepr";
import { Component, setupLogger } from "../../../logger";
import {
  K8sGateway,
  K8sGatewayClass,
  K8sGatewayFromType,
  K8sUDPRoute,
  UDSPackage,
} from "../../crd";
import { ParentRefElement } from "../../crd/generated/k8s/udproute-v1alpha2";
import { Expose, ExposeProtocol } from "../../crd/generated/package-v1alpha1";
import {
  Mutex,
  validateNamespace,
  getOwnerRef,
  purgeOrphans,
  sanitizeResourceName,
} from "../utils";
import {
  envoyDefaultGatewayName,
  envoyDefaultGatewayNamespace,
  getUDPGatewayName,
  getUDPGatewayNamespace,
} from "./constants";

const log = setupLogger(Component.OPERATOR_RECONCILERS);

type GatewayTarget = {
  name: string;
  namespace: string;
  defaultMode: boolean;
};

type UdpExposeEntry = { expose: Expose };

type DefaultListenerEntry = { namespace: string; port: number };

// In-memory map of default-mode UDP listeners, keyed by package id (namespace/name).
// Each package reconcile updates only its own entry; the shared Gateway's listener
// list is rebuilt from this map, avoiding a cluster-wide package list on every call.
export const defaultListenerMap = new Map<string, DefaultListenerEntry[]>();

const defaultGatewayMutex = new Mutex();

export function hasDefaultModeUDPExpose(pkg: UDSPackage): boolean {
  return getUDPExposeEntries(pkg).some(({ expose }) => resolveGatewayTarget(expose).defaultMode);
}

export function getUDPExposeEntries(pkg: UDSPackage): UdpExposeEntry[] {
  return (pkg.spec?.network?.expose ?? [])
    .map(expose => ({ expose }))
    .filter(({ expose }) => expose.protocol === ExposeProtocol.UDP);
}

function getPkgId(pkg: UDSPackage): string {
  return `${pkg.metadata!.namespace}/${pkg.metadata!.name}`;
}

function updateDefaultListenerMap(pkg: UDSPackage, entries: UdpExposeEntry[]): void {
  const namespace = pkg.metadata!.namespace!;
  const defaultEntries = entries
    .filter(({ expose }) => resolveGatewayTarget(expose).defaultMode)
    .map(({ expose }) => ({ namespace, port: expose.port! }));

  if (defaultEntries.length === 0) {
    defaultListenerMap.delete(getPkgId(pkg));
  } else {
    defaultListenerMap.set(getPkgId(pkg), defaultEntries);
  }
}

/** Removes a package's default-mode listeners from the in-memory map. Call during finalization. */
export function removeDefaultListenerMapEntry(pkg: UDSPackage): void {
  defaultListenerMap.delete(getPkgId(pkg));
}

export async function envoyGatewayResources(pkg: UDSPackage, namespace: string): Promise<void> {
  const pkgName = pkg.metadata?.name;
  if (!pkgName) {
    throw new Error("Package metadata.name is required");
  }

  const generation = (pkg.metadata?.generation ?? 0).toString();
  const ownerRefs = getOwnerRef(pkg);
  const udpEntries = getUDPExposeEntries(pkg);

  for (const entry of udpEntries) {
    const targetGateway = resolveGatewayTarget(entry.expose);

    if (targetGateway.defaultMode) {
      await validateDefaultGatewayClass();
    } else {
      await validateNamespace(targetGateway.namespace);
    }

    const udpRoute = generateUDPRoute(pkg, namespace, entry, generation, ownerRefs, targetGateway);
    log.debug(
      udpRoute,
      `Applying UDPRoute ${udpRoute.metadata?.namespace}/${udpRoute.metadata?.name}`,
    );
    await K8s(K8sUDPRoute).Apply(udpRoute, { force: true });
  }

  await purgeOrphans(generation, namespace, pkgName, K8sUDPRoute, log);

  updateDefaultListenerMap(pkg, udpEntries);
  await reconcileDefaultGatewayListeners();
}

export async function reconcileDefaultGatewayListeners(): Promise<void> {
  const release = await defaultGatewayMutex.acquire();
  try {
    await performDefaultGatewayReconciliation();
  } finally {
    release();
  }
}

function resolveGatewayTarget(expose: Expose): GatewayTarget {
  if (expose.gateway) {
    return {
      name: getUDPGatewayName(expose.gateway),
      namespace: getUDPGatewayNamespace(expose.gateway),
      defaultMode: false,
    };
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

async function validateDefaultGatewayClass(): Promise<void> {
  try {
    await K8s(K8sGatewayClass).Get("envoy-gateway");
  } catch (e) {
    if (e?.status !== 404) {
      throw e;
    }
    throw new Error(
      "GatewayClass 'envoy-gateway' was not found. Ensure Envoy Gateway is deployed before using default UDP expose entries.",
    );
  }
}

async function performDefaultGatewayReconciliation(): Promise<void> {
  const listenerEntries = getDefaultListenerEntries();

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
        listeners: listenerEntries.map(({ port, namespace }) => ({
          name: `udp-${port}`,
          protocol: "UDP",
          port,
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

function getDefaultListenerEntries(): DefaultListenerEntry[] {
  const entries: DefaultListenerEntry[] = [];
  for (const pkgEntries of defaultListenerMap.values()) {
    entries.push(...pkgEntries);
  }
  return entries.sort((a, b) => a.port - b.port);
}
