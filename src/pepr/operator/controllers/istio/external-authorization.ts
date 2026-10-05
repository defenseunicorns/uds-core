/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s } from "pepr";

import { IstioAction, IstioAuthorizationPolicy, K8sGateway, UDSPackage } from "../../crd";
import { Mode } from "../../crd/generated/package-v1alpha1";
import { getOwnerRef, purgeOrphans, sanitizeResourceName } from "../utils";
import { cleanupWaypointLabels, setupAmbientWaypoint } from "./ambient-waypoint";
import { log } from "./istio-resources";
import { getWaypointName } from "./waypoint-utils";

const EXTERNAL_AUTHORIZATION_LABELS = {
  "uds/for": "external-authorization",
};

/**
 * Builds the CUSTOM AuthorizationPolicy for a package external authorization provider.
 */
export function buildExternalAuthorizationPolicy(
  pkg: UDSPackage,
  isAmbient: boolean,
  waypointName: string,
): IstioAuthorizationPolicy {
  const externalAuthorization = pkg.spec!.network!.serviceMesh!.externalAuthorization!;
  const pkgName = pkg.metadata!.name!;
  const policy: IstioAuthorizationPolicy = {
    apiVersion: "security.istio.io/v1",
    kind: "AuthorizationPolicy",
    metadata: {
      name: sanitizeResourceName(`${pkgName}-${externalAuthorization.provider}`),
      namespace: pkg.metadata!.namespace!,
      labels: {
        "uds/package": pkgName,
        "uds/generation": (pkg.metadata?.generation ?? 0).toString(),
        "uds/mesh-mode": pkg.spec?.network?.serviceMesh?.mode || Mode.Ambient,
        ...EXTERNAL_AUTHORIZATION_LABELS,
      },
      ownerReferences: getOwnerRef(pkg),
    },
    spec: {
      action: IstioAction.Custom,
      provider: {
        name: externalAuthorization.provider,
      },
      rules: [{}],
    },
  };

  if (isAmbient) {
    policy.spec!.targetRef = {
      group: "gateway.networking.k8s.io",
      kind: "Gateway",
      name: waypointName,
    };
  } else {
    policy.spec!.selector = {
      matchLabels: externalAuthorization.selector,
    };
  }

  return policy;
}

/**
 * Reconciles provider-neutral external authorization resources for a package.
 */
export async function externalAuthorization(pkg: UDSPackage): Promise<number> {
  const { name: pkgName, namespace } = pkg.metadata ?? {};
  if (!pkgName || !namespace) {
    throw new Error("Package metadata is missing required fields");
  }

  const generation = (pkg.metadata?.generation ?? 0).toString();
  const config = pkg.spec?.network?.serviceMesh?.externalAuthorization;
  const mode = pkg.spec?.network?.serviceMesh?.mode || Mode.Ambient;
  const isAmbient = mode === Mode.Ambient;
  const waypointName = getWaypointName(pkgName);

  if (!config && !pkg.status?.externalAuthorizationProvider) {
    return 0;
  }

  if (config && isAmbient) {
    await setupAmbientWaypoint(
      pkg,
      {
        id: pkgName,
        selector: config.selector,
        type: "external-authorization",
      },
      EXTERNAL_AUTHORIZATION_LABELS,
      true,
    );
  } else {
    await cleanupWaypointLabels(namespace, waypointName);
  }

  if (config) {
    await K8s(IstioAuthorizationPolicy).Apply(
      buildExternalAuthorizationPolicy(pkg, isAmbient, waypointName),
      { force: true },
    );
  }

  await purgeOrphans(generation, namespace, pkgName, IstioAuthorizationPolicy, log, {
    ...EXTERNAL_AUTHORIZATION_LABELS,
  });
  await purgeOrphans(generation, namespace, pkgName, K8sGateway, log, {
    ...EXTERNAL_AUTHORIZATION_LABELS,
  });

  return config ? 1 : 0;
}

/**
 * Removes waypoint labels that would otherwise outlive a deleted Package resource.
 */
export async function cleanupExternalAuthorization(pkg: UDSPackage): Promise<void> {
  const { name: pkgName, namespace } = pkg.metadata ?? {};
  if (!pkgName || !namespace) return;

  await cleanupWaypointLabels(namespace, getWaypointName(pkgName));
}
