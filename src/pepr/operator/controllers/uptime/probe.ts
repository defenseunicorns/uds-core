/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { V1OwnerReference } from "@kubernetes/client-node";
import { K8s } from "pepr";
import { Component, setupLogger } from "../../../logger";
import { ClientWithId, credentialsCreateOrUpdate } from "../keycloak/clients/client-credentials";
import { updateBlackboxConfig } from "./config";
import { Expose, Gateway, Protocol, PrometheusProbe, Sso, UDSPackage } from "../../crd";
import { getFqdn } from "../domain-utils";
import { getOwnerRef, purgeOrphans, sanitizeResourceName } from "../utils";

// configure subproject logger
const log = setupLogger(Component.OPERATOR_UPTIME);

/**
 * Generate Probes for uptime monitoring via blackbox-exporter.
 * For Authservice-protected applications, also creates a probe Keycloak client
 * with service account credentials and the appropriate audience mapper.
 *
 * @param pkg UDS Package
 * @param namespace The namespace of the package
 * @returns probeNames - Kubernetes Probe resource names applied to the cluster
 * @returns ssoClients - Keycloak client IDs created for probe authentication
 */
export async function probe(
  pkg: UDSPackage,
  namespace: string,
): Promise<{ probeNames: string[]; ssoClients: string[] }> {
  const pkgName = pkg.metadata!.name!;
  const expose = pkg.spec?.network?.expose ?? [];
  const generation = (pkg.metadata?.generation ?? 0).toString();
  const ownerRefs = getOwnerRef(pkg);

  const probeNames: string[] = [];
  const probeClients: { clientId: string; secret: string }[] = [];

  try {
    for (const entry of expose) {
      // Skip if uptime checks are not configured (paths must be defined)
      if (!entry.uptime?.checks?.paths?.length) {
        continue;
      }

      log.debug(
        `Processing uptime probes for package: ${pkgName}, host: ${entry.host}, gateway: ${entry.gateway} in namespace ${namespace}`,
      );

      // Default to the standard http_2xx module
      let module = "http_2xx";

      // Get the matching Authservice SSO entry for this expose entry, if any
      const authserviceSso = getAuthserviceSso(entry, pkg.spec?.sso ?? []);

      // If Authservice is enabled, create a probe Keycloak client for the matched SSO entry and update blackbox config with new module
      if (authserviceSso) {
        const { clientId, secret } = await createProbeKeycloakClient(authserviceSso);
        log.debug(
          `Probe Keycloak client ready: clientId=${clientId} secret.length=${secret?.length}`,
        );
        probeClients.push({ clientId, secret });
        module = `http_200x_sso_${namespace}_${clientId}`; // Set module name to match the one generated in updateBlackboxConfig
      }

      // Generate the probe
      const payload = generateProbe(entry, namespace, pkgName, generation, ownerRefs, module);

      log.debug(payload, `Applying Probe ${payload.metadata?.name}`);

      // Apply the Probe and force overwrite any existing resource
      await K8s(PrometheusProbe).Apply(payload, { force: true });

      probeNames.push(payload.metadata!.name!);
    }

    // Update the shared blackbox config with all SSO modules for this namespace
    // Note: this will also remove any SSO modules for probes that no longer exist in this namespace
    await updateBlackboxConfig(namespace, probeClients);

    // Purge any orphaned probes from previous generations
    await purgeOrphans(generation, namespace, pkgName, PrometheusProbe, log);
  } catch (err) {
    throw new Error(`Failed to process Probes for ${pkgName}, cause: ${JSON.stringify(err)}`);
  }

  return { probeNames, ssoClients: probeClients.map(c => c.clientId) };
}

/**
 * Generate a Prometheus Probe for blackbox-exporter uptime monitoring
 *
 * @param expose The expose entry with uptime configuration
 * @param namespace The namespace for the probe
 * @param pkgName The package name
 * @param generation The package generation for tracking
 * @param ownerRefs Owner references for garbage collection
 * @param module The blackbox exporter module to use (defaults to http_2xx)
 */
export function generateProbe(
  expose: Expose,
  namespace: string,
  pkgName: string,
  generation: string,
  ownerRefs: V1OwnerReference[],
  module = "http_2xx",
): PrometheusProbe {
  const { uptime, host, gateway = Gateway.Tenant } = expose;
  const fqdn = getFqdn(expose);

  // Build the list of target URLs from paths
  const paths = uptime!.checks!.paths!;
  const targets = paths.map(path => `https://${fqdn}${path}`);

  // Generate a sanitized name for the probe using host+gateway
  const name = sanitizeResourceName(`uds-${host}-${gateway}-uptime`);

  const payload: PrometheusProbe = {
    metadata: {
      name,
      namespace,
      labels: {
        "uds/package": pkgName,
        "uds/generation": generation,
      },
      ownerReferences: ownerRefs,
    },
    spec: {
      module,
      prober: {
        url: "prometheus-blackbox-exporter.monitoring.svc.cluster.local:9115",
      },
      targets: {
        staticConfig: {
          static: targets,
        },
      },
    },
  };

  return payload;
}

/**
 * Creates or updates a Keycloak client for uptime probing of an Authservice-protected application.
 * The client uses service account credentials and includes an audience mapper for the app's SSO client.
 *
 * @param sso The matched SSO entry whose clientId is used to derive the probe client ID and audience
 */
export async function createProbeKeycloakClient(
  sso: Sso,
): Promise<{ clientId: string; secret: string }> {
  const probeClientId = `${sso.clientId}-probe`;

  const client = await credentialsCreateOrUpdate({
    clientId: probeClientId,
    name: `${sso.name} Uptime Probe`,
    serviceAccountsEnabled: true,
    standardFlowEnabled: false,
    publicClient: false,
    redirectUris: [],
    webOrigins: [],
    protocolMappers: [
      {
        name: "audience",
        protocol: Protocol.OpenidConnect,
        protocolMapper: "oidc-audience-mapper",
        config: {
          "included.client.audience": sso.clientId,
          "access.token.claim": "true",
          "introspection.token.claim": "true",
          "id.token.claim": "false",
          "lightweight.claim": "false",
          "userinfo.token.claim": "false",
        },
      },
    ],
  });

  return { clientId: (client as ClientWithId).clientId, secret: (client as ClientWithId).secret };
}

/**
 * Returns the matching SSO entry with enableAuthserviceSelector defined whose redirectUris
 * match the scheme+host of the expose entry's FQDN (path component is ignored).
 *
 * @param expose The expose entry to check
 * @param ssoEntries The SSO entries from the package spec
 */
export function getAuthserviceSso(expose: Expose, ssoEntries: Sso[]): Sso | undefined {
  const fqdnOrigin = `https://${getFqdn(expose)}`;

  return ssoEntries.find(sso => {
    if (!sso.enableAuthserviceSelector) {
      return false;
    }

    return (sso.redirectUris ?? []).some(uri => {
      try {
        return new URL(uri).origin === fqdnOrigin;
      } catch {
        return false;
      }
    });
  });
}
