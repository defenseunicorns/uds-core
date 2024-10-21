/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s } from "pepr";
import { IstioAuthorizationPolicy, IstioRequestAuthentication, UDSPackage } from "../../../crd";
import { getOwnerRef, purgeOrphans } from "../../utils";
import { log } from "./authservice";
import {
  authNRequestAuthentication,
  authserviceAuthorizationPolicy,
  defaultDenyAuthorizationPolicy,
  jwtAuthZAuthorizationPolicy,
} from "./policy-builder";
import { Action as AuthServiceAction, AuthServiceEvent } from "./types";

const operationMap: {
  [AuthServiceAction.Add]: "Apply";
  [AuthServiceAction.Remove]: "Delete";
} = {
  [AuthServiceAction.Add]: "Apply",
  [AuthServiceAction.Remove]: "Delete",
};

async function preApplyDefaultDeny(
  labelSelector: { [key: string]: string },
  pkg: UDSPackage,
  clientId: string,
) {
  const namespace = pkg.metadata!.namespace!;
  try {
    await K8s(IstioAuthorizationPolicy).Apply(
      buildResourceMetadataFn(pkg)(defaultDenyAuthorizationPolicy(labelSelector, clientId)),
    );
  } catch (e) {
    const msg = `Failed to create default deny policy for ${clientId} in ${namespace}: ${e}`;
    log.error(e, msg);
    throw new Error(msg, {
      cause: e,
    });
  }
}

function buildResourceMetadataFn(pkg: UDSPackage) {
  return (resource: IstioAuthorizationPolicy | IstioRequestAuthentication) => {
    resource!.metadata!.namespace = pkg.metadata!.namespace!;
    resource!.metadata!.ownerReferences = getOwnerRef(pkg);
    resource!.metadata!.labels = {
      "uds/package": pkg.metadata!.name!,
      "uds/generation": (pkg.metadata?.generation ?? 0).toString(),
    };
    return resource;
  };
}

async function updatePolicy(
  event: AuthServiceEvent,
  labelSelector: { [key: string]: string },
  pkg: UDSPackage,
) {
  // type safe map event to operation (either Apply or Delete)
  const operation = operationMap[event.action];
  const generation = (pkg.metadata?.generation ?? 0).toString();

  const updateMetadataFn = buildResourceMetadataFn(pkg);

  try {
    await K8s(IstioAuthorizationPolicy)[operation](
      updateMetadataFn(authserviceAuthorizationPolicy(labelSelector, event.clientId)),
    );
    await K8s(IstioRequestAuthentication)[operation](
      updateMetadataFn(authNRequestAuthentication(labelSelector, event.clientId)),
    );
    await K8s(IstioAuthorizationPolicy)[operation](
      updateMetadataFn(jwtAuthZAuthorizationPolicy(labelSelector, event.clientId)),
    );
  } catch (e) {
    const msg = `Failed to update auth policy for ${event.clientId} in ${pkg.metadata!.namespace}: ${e}`;
    log.error(e, msg);
    throw new Error(msg, {
      cause: e,
    });
  }

  try {
    await purgeOrphanPolicies(generation, pkg.metadata!.namespace!, pkg.metadata!.name!);
  } catch (e) {
    log.error(
      e,
      `Failed to purge orphan auth policies ${event.clientId} in ${pkg.metadata!.namespace!}: ${e}`,
    );
  }
}

async function purgeOrphanPolicies(generation: string, namespace: string, pkgName: string) {
  for (const kind of [IstioAuthorizationPolicy, IstioRequestAuthentication]) {
    await purgeOrphans(generation, namespace, pkgName, kind, log);
  }
}

export { preApplyDefaultDeny, updatePolicy };
