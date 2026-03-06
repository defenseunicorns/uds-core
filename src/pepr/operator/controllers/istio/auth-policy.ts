/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { IstioAction, IstioAuthorizationPolicy } from "../../crd";
import { sanitizeResourceName } from "../utils";
import {
  ambientEgressNamespace,
  sharedEgressPkgId as ambientSharedEgressPkgId,
  getSharedAnnotationKey,
} from "./istio-resources";

// Generate centralized AuthorizationPolicy for ambient egress
// - Namespace: istio-egress-ambient
// - Target: ServiceEntry/ambient-se-<host>
// - Rules:
//   - From: SA-first principals (cluster.local only), else namespaces
export function generateCentralAmbientEgressAuthorizationPolicy(
  host: string,
  generation: number,
  identities: { saPrincipals: string[]; namespaces: string[] },
  contributingPkgIds?: string[],
  identitiesByPort?: Record<string, { saPrincipals: string[]; namespaces: string[] }>,
): IstioAuthorizationPolicy {
  const name = sanitizeResourceName(`ambient-ap-${host}`);

  // Build "from" sources
  const principalSources = identities.saPrincipals.length
    ? [{ source: { principals: identities.saPrincipals } }]
    : [];
  const namespaceSources = identities.namespaces.length
    ? [{ source: { namespaces: identities.namespaces } }]
    : [];

  // If `identitiesByPort` is provided, generate one rule per destination port to enable
  // strict port-scoped enforcement via `to.operation.ports`.
  // Otherwise fall back to the legacy single from-only rule.
  const rules = identitiesByPort
    ? Object.entries(identitiesByPort)
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([port, portIdentities]) => {
          const parsedPort = Number(port);
          if (!Number.isFinite(parsedPort) || parsedPort <= 0) {
            return undefined;
          }

          const pSources = portIdentities.saPrincipals.length
            ? [{ source: { principals: portIdentities.saPrincipals } }]
            : [];
          const nSources = portIdentities.namespaces.length
            ? [{ source: { namespaces: portIdentities.namespaces } }]
            : [];

          const from = [...pSources, ...nSources];
          if (from.length === 0) {
            // Avoid emitting rules that match nothing; this can be produced transiently while
            // identities converge during reconciliation.
            return undefined;
          }

          return {
            from,
            to: [{ operation: { ports: [String(parsedPort)] } }],
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null)
    : [
        {
          from: [...principalSources, ...namespaceSources],
        },
      ];

  const annotations: Record<string, string> = {};
  for (const pkgId of contributingPkgIds ?? []) {
    annotations[getSharedAnnotationKey(pkgId)] = "user";
  }

  const ap: IstioAuthorizationPolicy = {
    metadata: {
      name,
      namespace: ambientEgressNamespace,
      ...(Object.keys(annotations).length > 0 ? { annotations } : {}),
      labels: {
        "uds/package": ambientSharedEgressPkgId,
        "uds/generation": generation.toString(),
        "uds/for": "egress",
      },
    },
    spec: {
      action: IstioAction.Allow,
      // Target the per-host ServiceEntry to restrict by destination host for both HTTP and TLS
      targetRef: {
        group: "networking.istio.io",
        kind: "ServiceEntry",
        name: sanitizeResourceName(`ambient-se-${host}`),
      },
      rules,
    },
  };

  return ap;
}
