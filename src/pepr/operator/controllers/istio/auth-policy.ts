/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { IstioAction, IstioAuthorizationPolicy } from "../../crd";
import { sanitizeResourceName } from "../utils";
import {
  ambientEgressNamespace,
  sharedEgressPkgId as ambientSharedEgressPkgId,
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
): IstioAuthorizationPolicy {
  const name = sanitizeResourceName(`ambient-ap-${host}`);

  // Build "from" sources
  const principalSources = identities.saPrincipals.length
    ? [{ source: { principals: identities.saPrincipals } }]
    : [];
  const namespaceSources = identities.namespaces.length
    ? [{ source: { namespaces: identities.namespaces } }]
    : [];

  // Build rules: only sources are needed; targetRef scopes to the specific host via ServiceEntry
  const rules = [
    {
      from: [...principalSources, ...namespaceSources],
    },
  ];

  const ap: IstioAuthorizationPolicy = {
    metadata: {
      name,
      namespace: ambientEgressNamespace,
      labels: {
        "uds/package": ambientSharedEgressPkgId,
        "uds/generation": generation.toString(),
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
