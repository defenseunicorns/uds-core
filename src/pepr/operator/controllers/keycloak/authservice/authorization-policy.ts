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

function authserviceAuthorizationPolicy(
  labelSelector: { [key: string]: string },
  name: string,
  namespace: string,
): IstioAuthorizationPolicy {
  return {
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
          to: [
            {
              operation: {
                notPorts: ["15020"],
                notPaths: ["/stats/prometheus"],
              },
            },
          ],
        },
      ],
      selector: {
        matchLabels: labelSelector,
      },
    },
  };
}

function jwtAuthZAuthorizationPolicy(
  labelSelector: { [key: string]: string },
  name: string,
  namespace: string,
): IstioAuthorizationPolicy {
  return {
    kind: "AuthorizationPolicy",
    metadata: {
      name: sanitizeResourceName(`${name}-jwt-authz`),
      namespace,
    },
    spec: {
      action: IstioAction.Deny,
      selector: {
        matchLabels: labelSelector,
      },
      rules: [
        {
          from: [
            {
              source: {
                notRequestPrincipals: [`https://sso.${UDSConfig.domain}/realms/uds/*`],
              },
            },
          ],
          to: [
            {
              operation: {
                notPorts: ["15020"],
                notPaths: ["/stats/prometheus"],
              },
            },
          ],
        },
      ],
    },
  };
}

function authNRequestAuthentication(
  labelSelector: { [key: string]: string },
  name: string,
  namespace: string,
): IstioRequestAuthentication {
  return {
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
      selector: {
        matchLabels: labelSelector,
      },
    },
  };
}

async function updatePolicy(
  event: AddOrRemoveClientEvent,
  labelSelector: { [key: string]: string },
  pkg: UDSPackage,
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
    await K8s(IstioAuthorizationPolicy)[operation](
      updateMetadata(authserviceAuthorizationPolicy(labelSelector, event.name, namespace)),
    );
    await K8s(IstioRequestAuthentication)[operation](
      updateMetadata(authNRequestAuthentication(labelSelector, event.name, namespace)),
    );
    await K8s(IstioAuthorizationPolicy)[operation](
      updateMetadata(jwtAuthZAuthorizationPolicy(labelSelector, event.name, namespace)),
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

export { updatePolicy };
