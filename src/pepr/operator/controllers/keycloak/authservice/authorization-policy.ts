/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s } from "pepr";
import { UDSConfig } from "../../../../config";
import {
  IstioAction,
  IstioAuthorizationPolicy,
  IstioRequestAuthentication,
  UDSPackage,
} from "../../../crd";
import { getOwnerRef, purgeOrphans, sanitizeResourceName } from "../../utils";
import { log } from "./authservice";
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
): IstioAuthorizationPolicy {
  // Create base policy with spec explicitly typed
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
        rules: [
          {
            when: [
              {
                key: "request.headers[authorization]",
                notValues: ["*"],
              },
            ],
            // Only add the 'to' block if not in ambient mode
            ...(isAmbient
              ? []
              : {
                  to: [
                    {
                      operation: {
                        notPorts: ["15020"],
                        notPaths: ["/stats/prometheus"],
                      },
                    },
                  ],
                }),
          },
        ],
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
): IstioAuthorizationPolicy {
  // Create a base policy with the common properties
  const policy: IstioAuthorizationPolicy = {
    kind: "AuthorizationPolicy",
    metadata: {
      name: sanitizeResourceName(`${name}-jwt-authz`),
      namespace,
    },
    spec: {
      action: IstioAction.Deny,
      rules: [
        {
          from: [
            {
              source: {
                notRequestPrincipals: [`https://sso.${UDSConfig.domain}/realms/uds/*`],
              },
            },
          ],
          // Only add the 'to' block if not in ambient mode
          ...(isAmbient
            ? []
            : {
                to: [
                  {
                    operation: {
                      notPorts: ["15020"],
                      notPaths: ["/stats/prometheus"],
                    },
                  },
                ],
              }),
        },
      ],
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
          jwksUri: `http://keycloak-http.keycloak.svc.cluster.local:8080/realms/uds/protocol/openid-connect/certs`,
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
  isAmbient = false,
  waypointName?: string,
) {
  // type safe map event to operation (either Apply or Delete)
  const operation = operationMap[event.action];
  const namespace = pkg.metadata!.namespace!;
  const generation = (pkg.metadata?.generation ?? 0).toString();
  const ownerReferences = getOwnerRef(pkg);

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
        ),
      ),
    );

    // Apply the JWT authentication policy
    await K8s(IstioRequestAuthentication)[operation](
      updateMetadata(
        authNRequestAuthentication(labelSelector, event.name, namespace, isAmbient, waypointName),
      ),
    );

    // Apply the JWT authorization policy
    await K8s(IstioAuthorizationPolicy)[operation](
      updateMetadata(
        jwtAuthZAuthorizationPolicy(labelSelector, event.name, namespace, isAmbient, waypointName),
      ),
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
  authNRequestAuthentication,
  authserviceAuthorizationPolicy,
  jwtAuthZAuthorizationPolicy,
  UDSConfig,
  updatePolicy,
};
