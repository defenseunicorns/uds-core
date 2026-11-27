/**
 * Copyright 2024-2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s } from "pepr";

import {
  IstioAction,
  IstioAuthorizationPolicy,
  IstioRequestAuthentication,
  UDSPackage,
} from "../../../crd";
import { UDSConfig } from "../../config/config";
import { PROMETHEUS_PRINCIPAL, getOwnerRef, sanitizeResourceName } from "../../utils";
import { log } from "./authservice";
import {
  buildMonitorOperations,
  computeMonitorExemptions,
  MonitorExemption,
} from "../../monitoring/monitor-exemptions";
import { AddOrRemoveClientEvent, Action as AuthServiceAction } from "./types";

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

function authserviceAuthorizationPolicy(
  labelSelector: { [key: string]: string },
  name: string,
  namespace: string,
  isAmbient = false,
  waypointName?: string,
  monitorExemptions: MonitorExemption[] = [],
): IstioAuthorizationPolicy {
  const { nonMetrics } = buildMonitorOperations(monitorExemptions);
  const policy: IstioAuthorizationPolicy = {
    kind: "AuthorizationPolicy",
    metadata: { name: sanitizeResourceName(`${name}-authservice`), namespace },
    spec: {
      action: IstioAction.Custom,
      provider: { name: "authservice" },
      rules: [
        {
          ...(nonMetrics.length ? { to: nonMetrics } : {}),
          when: [{ key: "request.headers[authorization]", notValues: ["*"] }],
        },
      ],
    },
  };

  setPolicyTarget(policy.spec!, isAmbient, waypointName, labelSelector);
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
  const { metrics, nonMetrics } = buildMonitorOperations(monitorExemptions);
  const ssoJwtSource = {
    notRequestPrincipals: [`https://sso.${UDSConfig.domain}/realms/uds/*`],
  };
  const requireJwt = { from: [{ source: ssoJwtSource }] };
  const policy: IstioAuthorizationPolicy = {
    kind: "AuthorizationPolicy",
    metadata: { name: sanitizeResourceName(`${name}-jwt-authz`), namespace },
    spec: {
      action: IstioAction.Deny,
      rules: metrics.length
        ? [
            {
              from: [{ source: { ...ssoJwtSource, notPrincipals: [PROMETHEUS_PRINCIPAL] } }],
              to: metrics,
            },
            { ...requireJwt, to: nonMetrics },
          ]
        : [requireJwt],
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
}

export {
  UDSConfig,
  authNRequestAuthentication,
  authserviceAuthorizationPolicy,
  jwtAuthZAuthorizationPolicy,
  updatePolicy,
};
