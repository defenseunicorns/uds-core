/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s } from "pepr";

import {
  IstioAction,
  IstioAuthorizationPolicy,
  IstioRequestAuthentication,
  Monitor,
  UDSPackage,
} from "../../../crd/index.js";
import { UDSConfig } from "../../config/config.js";
import { matchesLabels } from "../../istio/waypoint-utils.js";
import {
  PROMETHEUS_PRINCIPAL,
  getOwnerRef,
  purgeOrphans,
  sanitizeResourceName,
} from "../../utils.js";
import { log } from "./authservice.js";
import { AddOrRemoveClientEvent, Action as AuthServiceAction } from "./types.js";

const operationMap: {
  [AuthServiceAction.AddClient]: "Apply";
  [AuthServiceAction.RemoveClient]: "Delete";
} = {
  [AuthServiceAction.AddClient]: "Apply",
  [AuthServiceAction.RemoveClient]: "Delete",
};

/**
 * Sets the target for an Istio policy spec based on ambient mode.
 * If ambient mode is enabled and a waypoint name is provided, sets targetRef to the Gateway.
 * Otherwise, sets a pod selector for non-ambient mode. Ensures only one targeting field is present.
 */
function setPolicyTarget(
  spec: NonNullable<IstioAuthorizationPolicy["spec"]>,
  isAmbient: boolean,
  waypointName: string | undefined,
  labelSelector: { [key: string]: string },
) {
  if (isAmbient && waypointName) {
    spec.targetRef = {
      group: "gateway.networking.k8s.io",
      kind: "Gateway",
      name: waypointName,
    };
    delete spec.selector;
  } else {
    spec.selector = { matchLabels: labelSelector };
    delete spec.targetRef;
  }
}

interface MonitorExemption {
  port?: string;
  path?: string;
}

// Build 'to.operation' entries that represent NON-metrics traffic for the
// given monitor exemptions (i.e., all ports/paths except the metrics
// endpoints captured in the exemptions).
function buildNonMetricsOperations(
  monitorExemptions: MonitorExemption[],
): Array<{ operation: { ports?: string[]; notPorts?: string[]; notPaths?: string[] } }> {
  const entries: Array<{
    operation: { ports?: string[]; notPorts?: string[]; notPaths?: string[] };
  }> = [];

  // Group monitor exemptions by port -> set of paths
  const portToPaths = new Map<string, Set<string>>();
  for (const ex of monitorExemptions) {
    if (!ex.port) continue;
    const paths = portToPaths.get(ex.port) ?? new Set<string>();
    if (ex.path) paths.add(ex.path);
    portToPaths.set(ex.port, paths);
  }

  // Per-port entries: ports:[P], notPaths:[...paths] to exempt only listed paths on that port
  for (const [port, paths] of portToPaths.entries()) {
    const arrPaths = Array.from(paths);
    if (arrPaths.length > 0) {
      entries.push({ operation: { ports: [port], notPaths: arrPaths } });
    } else {
      // If no paths recorded, default to exempting '/metrics'
      entries.push({ operation: { ports: [port], notPaths: ["/metrics"] } });
    }
  }

  // Catch-all for all other ports: notPorts:[all exempt ports]
  const monitorPorts = Array.from(portToPaths.keys());
  if (monitorPorts.length > 0) {
    entries.push({ operation: { notPorts: monitorPorts } });
  }

  return entries;
}

// Build 'to.operation' entries that represent the METRICS traffic for the
// given monitor exemptions (the exact port + path combinations to treat as
// metrics endpoints).
function buildMetricsOperations(
  monitorExemptions: MonitorExemption[],
): Array<{ operation: { ports?: string[]; paths?: string[] } }> {
  const entries: Array<{ operation: { ports?: string[]; paths?: string[] } }> = [];

  const portToPaths = new Map<string, Set<string>>();
  for (const ex of monitorExemptions) {
    if (!ex.port) continue;
    const paths = portToPaths.get(ex.port) ?? new Set<string>();
    if (ex.path) paths.add(ex.path);
    portToPaths.set(ex.port, paths);
  }

  for (const [port, paths] of portToPaths.entries()) {
    const arrPaths = Array.from(paths);
    if (arrPaths.length > 0) {
      entries.push({ operation: { ports: [port], paths: arrPaths } });
    } else {
      // If no paths recorded, default to treating '/metrics' as the metrics endpoint
      entries.push({ operation: { ports: [port], paths: ["/metrics"] } });
    }
  }

  return entries;
}

function authserviceAuthorizationPolicy(
  labelSelector: { [key: string]: string },
  name: string,
  namespace: string,
  isAmbient = false,
  waypointName?: string,
  monitorExemptions: MonitorExemption[] = [],
): IstioAuthorizationPolicy {
  const nonMetricsOps = buildNonMetricsOperations(monitorExemptions);
  const unauthenticatedWhen = [
    {
      key: "request.headers[authorization]",
      notValues: ["*"],
    },
  ];
  const rules: NonNullable<IstioAuthorizationPolicy["spec"]>["rules"] = [];
  const hasMonitorExemptions = nonMetricsOps.length > 0;

  if (!hasMonitorExemptions) {
    // No monitor-based exemptions: send all unauthenticated traffic to Authservice.
    rules.push({
      when: unauthenticatedWhen,
    });
  } else {
    // With monitor exemptions present, treat all metrics endpoints as outside of Authservice
    // and send only non-metrics unauthenticated traffic through Authservice.
    rules.push({
      to: nonMetricsOps,
      when: unauthenticatedWhen,
    });
  }

  const policy: IstioAuthorizationPolicy & { spec: NonNullable<IstioAuthorizationPolicy["spec"]> } =
    {
      kind: "AuthorizationPolicy",
      metadata: {
        name: sanitizeResourceName(`${name}-authservice`),
        namespace,
      },
      spec: {
        action: IstioAction.Custom,
        provider: {
          name: "authservice",
        },
        rules,
      },
    };

  setPolicyTarget(policy.spec, isAmbient, waypointName, labelSelector);
  return policy;
}

function jwtAuthZAuthorizationPolicy(
  labelSelector: { [key: string]: string },
  name: string,
  namespace: string,
  isAmbient = false,
  waypointName?: string,
  monitorExemptions: MonitorExemption[] = [],
): IstioAuthorizationPolicy {
  // Create a base policy with the common properties
  const metricsOps = buildMetricsOperations(monitorExemptions);
  const nonMetricsOps = buildNonMetricsOperations(monitorExemptions);

  const rules: NonNullable<IstioAuthorizationPolicy["spec"]>["rules"] = [];

  const ssoJwtSource = {
    notRequestPrincipals: [`https://sso.${UDSConfig.domain}/realms/uds/*`],
  };

  const prometheusOrSsoJwtSource = {
    ...ssoJwtSource,
    notPrincipals: [PROMETHEUS_PRINCIPAL],
  };

  const hasMonitorExemptions = metricsOps.length > 0;

  if (!hasMonitorExemptions) {
    // No monitor-based exemptions: deny any request that does not present a UDS JWT principal.
    rules.push({
      from: [
        {
          source: ssoJwtSource,
        },
      ],
    });
  } else {
    // Deny metrics requests for callers that are not Prometheus and do not have a valid UDS JWT principal.
    rules.push({
      from: [
        {
          source: prometheusOrSsoJwtSource,
        },
      ],
      to: metricsOps,
    });

    // Deny requests to all other endpoints that do not present a valid UDS JWT principal.
    rules.push({
      from: [
        {
          source: ssoJwtSource,
        },
      ],
      to: nonMetricsOps,
    });
  }

  const policy: IstioAuthorizationPolicy = {
    kind: "AuthorizationPolicy",
    metadata: {
      name: sanitizeResourceName(`${name}-jwt-authz`),
      namespace,
    },
    spec: {
      action: IstioAction.Deny,
      rules,
    },
  };

  setPolicyTarget(policy.spec!, isAmbient, waypointName, labelSelector);
  return policy;
}

function authNRequestAuthentication(
  labelSelector: { [key: string]: string },
  name: string,
  namespace: string,
  isAmbient = false,
  waypointName?: string,
): IstioRequestAuthentication {
  // Create base policy with spec explicitly typed
  const policy: IstioRequestAuthentication & {
    spec: NonNullable<IstioRequestAuthentication["spec"]>;
  } = {
    kind: "RequestAuthentication",
    metadata: {
      name: sanitizeResourceName(`${name}-jwt-authn`),
      namespace,
    },
    spec: {
      jwtRules: [
        {
          audiences: [name],
          forwardOriginalToken: true,
          issuer: `https://sso.${UDSConfig.domain}/realms/uds`,
          jwksUri: `https://sso.${UDSConfig.domain}/realms/uds/protocol/openid-connect/certs`,
        },
      ],
    },
  };

  setPolicyTarget(policy.spec!, isAmbient, waypointName, labelSelector);
  return policy;
}

async function updatePolicy(
  event: AddOrRemoveClientEvent,
  labelSelector: { [key: string]: string },
  pkg: UDSPackage,
  isAmbient?: boolean,
  waypointName?: string,
) {
  // type safe map event to operation (either Apply or Delete)
  const operation = operationMap[event.action];
  const namespace = pkg.metadata!.namespace!;
  const generation = (pkg.metadata?.generation ?? 0).toString();
  const ownerReferences = getOwnerRef(pkg);

  // Compute per-monitor exemptions (port + path) that should bypass authservice/JWT deny
  const monitorExemptions = computeMonitorExemptions(pkg, labelSelector);
  if (!isAmbient) {
    // Add 15020 /stats/prometheus like a monitor exemption for sidecar mode
    monitorExemptions.push({ port: "15020", path: "/stats/prometheus" });
  }

  const updateMetadata = (resource: IstioAuthorizationPolicy | IstioRequestAuthentication) => {
    resource!.metadata!.ownerReferences = ownerReferences;
    resource!.metadata!.labels = {
      "uds/package": pkg.metadata!.name!,
      "uds/generation": generation,
    };
    return resource;
  };

  try {
    // Apply the authservice authorization policy
    await K8s(IstioAuthorizationPolicy)[operation](
      updateMetadata(
        authserviceAuthorizationPolicy(
          labelSelector,
          event.name,
          namespace,
          isAmbient,
          waypointName,
          monitorExemptions,
        ),
      ),
      { force: true },
    );

    // Apply the JWT authentication policy
    await K8s(IstioRequestAuthentication)[operation](
      updateMetadata(
        authNRequestAuthentication(labelSelector, event.name, namespace, isAmbient, waypointName),
      ),
      { force: true },
    );

    // Apply the JWT authorization policy
    await K8s(IstioAuthorizationPolicy)[operation](
      updateMetadata(
        jwtAuthZAuthorizationPolicy(
          labelSelector,
          event.name,
          namespace,
          isAmbient,
          waypointName,
          monitorExemptions,
        ),
      ),
      { force: true },
    );
  } catch (e) {
    const msg = `Failed to update auth policy for ${event.name} in ${namespace}: ${e}`;
    log.error(e, msg);
    throw new Error(msg, {
      cause: e,
    });
  }

  try {
    await purgeOrphanPolicies(generation, namespace, pkg.metadata!.name!);
  } catch (e) {
    log.error(e, `Failed to purge orphan auth policies ${event.name} in ${namespace}: ${e}`);
  }
}

async function purgeOrphanPolicies(generation: string, namespace: string, pkgName: string) {
  for (const kind of [IstioAuthorizationPolicy, IstioRequestAuthentication]) {
    await purgeOrphans(generation, namespace, pkgName, kind, log);
  }
}

export {
  UDSConfig,
  authNRequestAuthentication,
  authserviceAuthorizationPolicy,
  computeMonitorExemptions,
  jwtAuthZAuthorizationPolicy,
  updatePolicy,
};

/**
 * Compute monitor-based exemptions for authservice policies by selecting monitors
 * whose selectors intersect with the protected labelSelector. If the labelSelector
 * is empty (namespace-wide protection), all monitors in the package are exempted.
 */
function computeMonitorExemptions(
  pkg: UDSPackage,
  labelSelector: Record<string, string>,
): MonitorExemption[] {
  const monitors: Monitor[] = pkg.spec?.monitor ?? [];
  const out: MonitorExemption[] = [];

  for (const m of monitors) {
    const sel: Record<string, string> = m.podSelector ?? m.selector;
    // If labelSelector is empty, treat as namespace-wide (matches all);
    // otherwise require ALL labels in labelSelector to match the monitor selector
    const labelSelectorIsEmpty = Object.keys(labelSelector).length === 0;
    if (labelSelectorIsEmpty || matchesLabels(sel, labelSelector)) {
      out.push({ port: String(m.targetPort), path: m.path || "/metrics" });
    }
  }

  return out;
}
