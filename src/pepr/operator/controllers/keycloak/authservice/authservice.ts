/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { R } from "pepr";
import { UDSConfig } from "../../../../config";
import { Component, setupLogger } from "../../../../logger";
import { K8sGateway, UDSPackage } from "../../../crd";
import { AuthserviceClient, Mode } from "../../../crd/generated/package-v1alpha1";
import { cleanupWaypointLabels, setupAmbientWaypoint } from "../../istio/ambient-waypoint";
import { getWaypointName, shouldUseAmbientWaypoint } from "../../istio/waypoint-utils";
import { purgeOrphans } from "../../utils";
import { Client } from "../types";
import { updatePolicy } from "./authorization-policy";
import {
  getAuthserviceConfig,
  operatorConfig,
  setAuthserviceConfig,
  updateAuthServiceSecret,
} from "./config";
import {
  Action,
  AddOrRemoveClientEvent,
  AuthServiceEvent,
  AuthserviceConfig,
  Chain,
} from "./types";

export const log = setupLogger(Component.OPERATOR_AUTHSERVICE);
let lock = false;

export async function authservice(
  pkg: UDSPackage,
  clients: Map<string, Client>,
): Promise<AuthserviceClient[]> {
  if (!pkg.metadata?.namespace || !pkg.metadata?.name) {
    throw new Error("Package metadata is missing required fields");
  }

  // Get the requested service mesh mode, default to sidecar if not specified
  const istioMode = pkg.spec?.network?.serviceMesh?.mode || Mode.Sidecar;
  const previousMeshMode = pkg.status?.meshMode || Mode.Sidecar;

  // Get the list of clients from the package
  const authServiceClients = R.filter(
    sso => R.isNotNil(sso.enableAuthserviceSelector),
    pkg.spec?.sso || [],
  );

  // Check if we're in ambient mode by looking for the waypoint annotation
  const isAmbient = shouldUseAmbientWaypoint(pkg);

  // Build the new client status objects
  const newAuthserviceClients = authServiceClients.map(sso => ({
    name: sso.name ?? sso.clientId,
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

    // Get the full waypoint name for authorization policies
    const fullWaypointName = getWaypointName(sso.clientId);

    await reconcileAuthservice(
      { name: sso.clientId, action: Action.AddClient, client },
      sso.enableAuthserviceSelector!,
      isAmbient,
      pkg,
      fullWaypointName,
    );
  }

  // Cleanup logic now takes the new objects
  await purgeAuthserviceClients(pkg, newAuthserviceClients, previousMeshMode, istioMode);

  // Clean up any existing waypoint resources if SSO is not configured
  await purgeOrphans(
    (pkg.metadata?.generation ?? 0).toString(),
    pkg.metadata.namespace,
    pkg.metadata.name,
    K8sGateway,
    log,
  );

  // Return the new status objects for status update
  return newAuthserviceClients;
}

export async function purgeAuthserviceClients(
  pkg: UDSPackage,
  newAuthserviceClients: AuthserviceClient[] = [],
  previousMeshMode: string,
  currentMeshMode: string,
): Promise<void> {
  const isAmbient = shouldUseAmbientWaypoint(pkg);
  const prevClients = pkg.status?.authserviceClients || [];

  // Check if mesh mode changed
  const meshModeChanged = previousMeshMode !== currentMeshMode;

  // Find clients to clean up:
  // 1. Removed clients
  // 2. Clients with changed selectors
  // 3. All clients if mesh mode changed
  const clientsToCleanup = meshModeChanged
    ? prevClients // Clean up all previous clients if mesh mode changed
    : prevClients.filter(oldClient => {
        // Find matching client by ID
        const match = newAuthserviceClients.find(
          newClient => newClient.clientId === oldClient.clientId,
        );

        // If no match found, this client was removed
        if (!match) {
          return true;
        }

        // Check if either selector is empty
        const oldSelectorEmpty =
          !oldClient.selector || Object.keys(oldClient.selector).length === 0;
        const newSelectorEmpty = !match.selector || Object.keys(match.selector).length === 0;

        // Both empty, no need for cleanup
        if (oldSelectorEmpty && newSelectorEmpty) {
          return false;
        } else if (!oldSelectorEmpty && !newSelectorEmpty) {
          // Both non-empty, check if they're different
          return !R.equals(match.selector, oldClient.selector);
        } else if (oldSelectorEmpty && !newSelectorEmpty) {
          // Changed from empty to non-empty
          return true;
        } else {
          // Changed from non-empty to empty
          return false;
        }
      });

  if (meshModeChanged) {
    log.info(
      `Mesh mode changed from ${previousMeshMode} to ${currentMeshMode}, cleaning up waypoint labels`,
    );
  }

  await Promise.all(
    clientsToCleanup.map(async client => {
      const fullWaypointName = getWaypointName(client.clientId);
      log.info(`Cleaning up authservice client ${client.clientId}`, {
        reason: meshModeChanged ? "mesh_mode_change" : "client_removed_or_modified",
      });

      await reconcileAuthservice(
        { name: client.clientId, action: Action.RemoveClient },
        {},
        isAmbient,
        pkg,
        fullWaypointName,
      );

      if (pkg.metadata?.namespace) {
        await cleanupWaypointLabels(pkg.metadata.namespace, fullWaypointName);
      }
    }),
  );
}

function isAddOrRemoveClientEvent(event: AuthServiceEvent): event is AddOrRemoveClientEvent {
  return event.action === Action.AddClient || event.action === Action.RemoveClient;
}

export async function reconcileAuthservice(
  event: AuthServiceEvent,
  labelSelector: { [key: string]: string } = {},
  isAmbient: boolean,
  pkg?: UDSPackage,
  waypointName?: string,
) {
  await updateConfig(event);
  if (isAddOrRemoveClientEvent(event)) {
    if (!pkg) {
      throw new Error("Package must be provided for AddClient or RemoveClient events");
    }
    await updatePolicy(event, labelSelector, pkg, isAmbient, waypointName);
  }
}

// Write authservice config to secret (ensure the new function name is referenced)
export async function updateConfig(event: AuthServiceEvent) {
  // Lock to prevent concurrent updates
  if (lock) {
    log.debug("Lock is set for config update, retrying...");
    setTimeout(() => updateConfig(event), 0);
    return;
  }

  let config: AuthserviceConfig;

  try {
    log.debug("Locking config for update");
    lock = true;

    // build updated config based on event
    config = await getAuthserviceConfig().then(config => {
      return buildConfig(config, event);
    });

    // Update the in-memory config immediately
    setAuthserviceConfig(config);
  } catch (e) {
    log.error("Failed to build in memory authservice secret for event", event, e);
    throw e;
  } finally {
    // unlock config
    log.debug("Unlocking config for update");
    lock = false;
  }

  // apply the authservice secret
  log.debug("Applying authservice secret");
  await updateAuthServiceSecret(config);
}

export function buildConfig(config: AuthserviceConfig, event: AuthServiceEvent) {
  let chains: Chain[];

  if (event.action === Action.AddClient) {
    // Add the new chain to the existing authservice config
    chains = config.chains.filter(chain => chain.name !== event.name);
    chains = chains.concat(buildChain(event));
    // Sort the chains by their name before returning. Note that the accuracy of
    // sorting here is not relevant, only the consistency.
    const sortByName = R.sortBy(R.prop("name"));
    chains = sortByName(chains);
  } else if (event.action === Action.RemoveClient) {
    // Search in the existing chains for the chain to remove by name.
    // Filtering here should preserve the order, so there is no need to re-sort.
    chains = config.chains.filter(chain => chain.name !== event.name);
    // Handle global config updates
  } else if (event.action === Action.UpdateGlobalConfig) {
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
      // Remove the trusted certificate authority if a CA is not provided
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
  return { ...config, chains } as AuthserviceConfig;
}

export function buildChain(update: AuthServiceEvent) {
  // TODO: get this from the package
  // TODO: update to loop and build multiple chaings on redirectUris
  // Parse the hostname from the first client redirect URI
  const hostname = new URL(update.client!.redirectUris[0]).hostname;

  const chain: Chain = {
    name: update.name,
    match: {
      header: ":authority",
      prefix: hostname,
    },
    filters: [
      {
        oidc_override: {
          authorization_uri: `https://sso.${UDSConfig.domain}/realms/${operatorConfig.realm}/protocol/openid-connect/auth`,
          token_uri: `https://sso.${UDSConfig.domain}/realms/${operatorConfig.realm}/protocol/openid-connect/token`,
          callback_uri: update.client!.redirectUris[0],
          client_id: update.client!.clientId,
          client_secret: update.client!.secret,
          scopes: [],
          logout: {
            path: "/logout",
            redirect_uri: `https://sso.${UDSConfig.domain}/realms/${operatorConfig.realm}/protocol/openid-connect/logout`,
          },
          cookie_name_prefix: update.client!.clientId,
        },
      },
    ],
  };
  return chain;
}
