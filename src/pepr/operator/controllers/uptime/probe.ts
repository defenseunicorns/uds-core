/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { V1OwnerReference } from "@kubernetes/client-node";
import { K8s } from "pepr";
import { Component, setupLogger } from "../../../logger";
import { Expose, Gateway, PrometheusProbe, UDSPackage } from "../../crd";
import { getFqdn } from "../domain-utils";
import { getOwnerRef, purgeOrphans, retryWithDelay, sanitizeResourceName } from "../utils";

// configure subproject logger
const log = setupLogger(Component.OPERATOR_UPTIME);

/**
 * Generate Probes for uptime monitoring via blackbox-exporter
 *
 * @param pkg UDS Package
 * @param namespace
 */
export async function probe(pkg: UDSPackage, namespace: string): Promise<string[]> {
  const pkgName = pkg.metadata!.name!;
  const expose = pkg.spec?.network?.expose ?? [];
  const generation = (pkg.metadata?.generation ?? 0).toString();
  const ownerRefs = getOwnerRef(pkg);

  const probeNames: string[] = [];

  try {
    for (const entry of expose) {
      // Skip if uptime checks are not configured (paths must be defined)
      if (!entry.uptime?.checks?.paths?.length) {
        continue;
      }

      log.debug(
        `Processing uptime probes for package: ${pkgName}, host: ${entry.host}, gateway: ${entry.gateway} in namespace ${namespace}`,
      );

      // Generate the probe
      const payload = generateProbe(entry, namespace, pkgName, generation, ownerRefs);

      log.debug(payload, `Applying Probe ${payload.metadata?.name}`);

      // Apply the Probe and force overwrite any existing resource
      await K8s(PrometheusProbe).Apply(payload, { force: true });

      probeNames.push(payload.metadata!.name!);
    }

    // Purge any orphaned probes from previous generations
    await retryWithDelay(async function purgeOrphanedProbes() {
      return purgeOrphans(generation, namespace, pkgName, PrometheusProbe, log);
    }, log);
  } catch (err) {
    throw new Error(`Failed to process Probes for ${pkgName}, cause: ${JSON.stringify(err)}`);
  }

  return probeNames;
}

/**
 * Generate a Prometheus Probe for blackbox-exporter uptime monitoring
 *
 * @param expose The expose entry with uptime configuration
 * @param namespace The namespace for the probe
 * @param pkgName The package name
 * @param generation The package generation for tracking
 * @param ownerRefs Owner references for garbage collection
 */
export function generateProbe(
  expose: Expose,
  namespace: string,
  pkgName: string,
  generation: string,
  ownerRefs: V1OwnerReference[],
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
      // Use default http_2xx module
      module: "http_2xx",
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
