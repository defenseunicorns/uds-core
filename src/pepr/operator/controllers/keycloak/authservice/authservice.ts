/**
 * Copyright 2024-2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { R } from "pepr";

import { Component, setupLogger } from "../../../../logger";
import {
  IstioAuthorizationPolicy,
  IstioRequestAuthentication,
  K8sGateway,
  UDSPackage,
} from "../../../crd";
import { AuthserviceClient, Mode } from "../../../crd/generated/package-v1alpha1";
import { cleanupWaypointLabels, setupAmbientWaypoint } from "../../istio/ambient-waypoint";
import { getWaypointName } from "../../istio/waypoint-utils";
import { getAuthserviceClients, getHostExposure, purgeOrphans } from "../../utils";
import { Client } from "../types";
import { UDSConfig, updatePolicy } from "./authorization-policy";
import { computeMonitorExemptions } from "../../monitoring/monitor-exemptions";
import { getAuthserviceConfig, operatorConfig, updateAuthServiceSecret } from "./config";
import {
  Action,
  AddOrRemoveClientEvent,
  AuthServiceEvent,
  AuthserviceConfig,
  Chain,
} from "./types";

export const log = setupLogger(Component.OPERATOR_AUTHSERVICE);
let pendingConfigUpdate: Promise<void> = Promise.resolve();

export async function authservice(
  pkg: UDSPackage,
  clients: Map<string, Client>,
): Promise<AuthserviceClient[]> {
  if (!pkg.metadata?.namespace || !pkg.metadata?.name) {
    throw new Error("Package metadata is missing required fields");
  }

  // Get the requested service mesh mode, default to ambient if not specified
  const istioMode = pkg.spec?.network?.serviceMesh?.mode || Mode.Ambient;
  const isAmbient = istioMode === Mode.Ambient;

  // Get the list of authservice-enabled clients from the package
  const authServiceClients = getAuthserviceClients(pkg);

  // Build the new client status objects
  const newAuthserviceClients = authServiceClients.map(sso => ({
    clientId: sso.clientId,
    selector: sso.enableAuthserviceSelector || {},
  }));

  // Reconcile each client
  for (const sso of authServiceClients) {
    if (isAmbient) {
      await setupAmbientWaypoint(pkg, sso);
    }

    const client = clients.get(sso.clientId);
    if (!client) {
      throw new Error(`Failed to get client ${sso.clientId}`);
    }

    const event: AddOrRemoveClientEvent = { name: sso.clientId, action: Action.AddClient, client };
    await updateConfig({ ...event, hostAuthentication: !!sso.authservice });
    if (!sso.authservice) {
      await updatePolicy(
        event,
        sso.enableAuthserviceSelector!,
        pkg,
        isAmbient,
        getWaypointName(sso.clientId),
      );
    }
  }

  // Return the new status objects for status update
  return newAuthserviceClients;
}

export async function cleanupAuthservice(pkg: UDSPackage, clients: AuthserviceClient[]) {
  const mode = pkg.spec?.network?.serviceMesh?.mode || Mode.Ambient;
  await purgeAuthserviceClients(pkg, clients, pkg.status?.meshMode || Mode.Ambient, mode);
  // A selector-to-host migration keeps the client ID and retires its legacy policies.
  const kinds =
    clients.length || pkg.status?.authserviceClients?.length
      ? [IstioAuthorizationPolicy, IstioRequestAuthentication, K8sGateway]
      : [K8sGateway];
  for (const kind of kinds) {
    await purgeOrphans(
      String(pkg.metadata?.generation ?? 0),
      pkg.metadata!.namespace!,
      pkg.metadata!.name!,
      kind,
      log,
      undefined,
      kind !== K8sGateway && pkg.spec?.sso?.some(sso => !!sso.authservice),
    );
  }
}

export async function purgeAuthserviceClients(
  pkg: UDSPackage,
  newAuthserviceClients: AuthserviceClient[] = [],
  previousMeshMode: Mode,
  currentMeshMode: Mode,
): Promise<void> {
  const prevClients = pkg.status?.authserviceClients || [];

  // Check if mesh mode changed
  const meshModeChanged = previousMeshMode !== currentMeshMode;

  // First handle truly removed clients
  const removedClients = prevClients.filter(
    oldClient => !newAuthserviceClients.some(c => c.clientId === oldClient.clientId),
  );

  // Process removed clients
  await Promise.all(
    removedClients.map(async client => {
      const fullWaypointName = getWaypointName(client.clientId);
      log.info(`Removing authservice client ${client.clientId}`);

      const event: AddOrRemoveClientEvent = { name: client.clientId, action: Action.RemoveClient };
      await updateConfig(event);
      await updatePolicy(event, {}, pkg, false, fullWaypointName);

      if (
        pkg.metadata?.namespace &&
        !newAuthserviceClients.some(c => getWaypointName(c.clientId) === fullWaypointName)
      ) {
        await cleanupWaypointLabels(pkg.metadata.namespace, fullWaypointName);
      }
    }),
  );

  if (!pkg.metadata?.namespace) return;
  for (const client of newAuthserviceClients) {
    const sso = pkg.spec?.sso?.find(s => s.clientId === client.clientId);
    const host = sso && getHostExposure(pkg, sso);
    const previous = prevClients.find(c => c.clientId === client.clientId);
    const waypoint = getWaypointName(client.clientId);
    if (currentMeshMode === Mode.Ambient && host) {
      // A replacement Service can select the same pods as the retired Service.
      await cleanupWaypointLabels(
        pkg.metadata.namespace,
        waypoint,
        host.service,
        computeMonitorExemptions(pkg, host.selector!, true).length ? host.selector : undefined,
      );
    } else if (
      previous &&
      (meshModeChanged || JSON.stringify(previous.selector) !== JSON.stringify(client.selector))
    ) {
      await cleanupWaypointLabels(pkg.metadata.namespace, waypoint);
    }
  }
}

export async function updateConfig(event: AuthServiceEvent): Promise<void> {
  const previousUpdate = pendingConfigUpdate;
  let release = () => {};
  pendingConfigUpdate = new Promise<void>(resolve => {
    release = resolve;
  });
  await previousUpdate;
  try {
    const config = buildConfig(await getAuthserviceConfig(), event);
    // Queue the snapshot under the lock and release it while the batch is written.
    return updateAuthServiceSecret(config);
  } catch (e) {
    log.error(
      { action: event.action, name: event.name },
      "Failed to build Authservice configuration",
    );
    throw e;
  } finally {
    release();
  }
}

export function buildConfig(config: AuthserviceConfig, event: AuthServiceEvent): AuthserviceConfig {
  let chains: Chain[];

  if (event.action === Action.AddClient) {
    // Add the new chain to the existing authservice config
    chains = [...config.chains.filter(chain => chain.name !== event.name), buildChain(event)];
    // Authservice selects the first matching chain. Exact hosts precede legacy prefixes.
    chains = R.sortWith<Chain>(
      [R.descend(chain => Boolean(chain.match.equality)), R.ascend(chain => chain.name)],
      chains,
    );
  } else if (event.action === Action.RemoveClient) {
    // Search in the existing chains for the chain to remove by name.
    // Filtering here should preserve the order, so there is no need to re-sort.
    chains = config.chains.filter(chain => chain.name !== event.name);
    // Handle global config updates
  } else if (event.action === Action.UpdateGlobalConfig) {
    config = { ...config, default_oidc_config: { ...config.default_oidc_config } };
    if (!event.redisUri) {
      // Remove the redis session store config if a URI is not provided
      delete config.default_oidc_config.redis_session_store_config;
    } else {
      // Update the redis session store config if a URI is provided
      config.default_oidc_config.redis_session_store_config = {
        server_uri: event.redisUri,
      };
    }
    if (!event.trustedCA) {
      // Remove the trust configuration if a CA bundle is not provided
      delete config.default_oidc_config.trusted_certificate_authority;
    } else {
      // Update the trusted certificate authority if a CA is provided
      config.default_oidc_config.trusted_certificate_authority = event.trustedCA;
    }
    chains = config.chains;
  } else {
    throw new Error(`Unhandled Action: ${event.action satisfies never}`);
  }

  // Add the new chains to the existing authservice config
  return { ...config, chains };
}

export function buildChain(update: AuthServiceEvent): Chain {
  const client = update.client!;
  const callbackUri = client.redirectUris[0];
  // TODO: get this from the package
  // TODO: update to loop and build multiple chains on redirectUris
  // Parse the hostname from the first client redirect URI
  const hostname = new URL(callbackUri).hostname;

  return {
    name: update.name,
    match: {
      header: ":authority",
      ...(update.hostAuthentication ? { equality: hostname } : { prefix: hostname }),
    },
    filters: [
      {
        oidc_override: {
          authorization_uri: `https://sso.${UDSConfig.domain}/realms/${operatorConfig.realm}/protocol/openid-connect/auth`,
          token_uri: `https://sso.${UDSConfig.domain}/realms/${operatorConfig.realm}/protocol/openid-connect/token`,
          callback_uri: callbackUri,
          client_id: client.clientId,
          client_secret: client.secret,
          ...(update.hostAuthentication && {
            id_token: { header: "x-uds-authservice-token", preamble: "Bearer" },
          }),
          scopes: [],
          logout: {
            path: "/logout",
            redirect_uri: `https://sso.${UDSConfig.domain}/realms/${operatorConfig.realm}/protocol/openid-connect/logout`,
          },
          cookie_name_prefix: client.clientId,
        },
      },
    ],
  };
}
