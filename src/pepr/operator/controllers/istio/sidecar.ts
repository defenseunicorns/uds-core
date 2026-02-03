/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { V1OwnerReference } from "@kubernetes/client-node";
import { IstioOutboundTrafficPolicyMode, IstioSidecar } from "../../crd/index.js";
import { sanitizeResourceName } from "../utils.js";

/**
 * Creates a Sidecar to enforce outbound traffic policies
 *
 * @param hostPortsProtocol
 * @param selector
 * @param pkgName
 * @param namespace
 * @param generation
 * @param ownerRefs
 */
export function generateEgressSidecar(
  selector: Record<string, string> | undefined,
  pkgName: string,
  namespace: string,
  generation: string,
  ownerRefs: V1OwnerReference[],
) {
  const name = generateSidecarName(pkgName, selector);

  const sidecar: IstioSidecar = {
    metadata: {
      name,
      namespace,
      labels: {
        "uds/package": pkgName,
        "uds/generation": generation,
      },
      // Use the CR as the owner ref for each Sidecar
      ownerReferences: ownerRefs,
    },
    spec: {
      outboundTrafficPolicy: { mode: IstioOutboundTrafficPolicyMode.RegistryOnly },
      ...(selector && { workloadSelector: { labels: selector } }),
    },
  };

  return sidecar;
}
function generateSidecarName(pkgName: string, selector: Record<string, string> | undefined) {
  const selectorString = selector
    ? Object.entries(selector)
        .map(([key, value]) => `${key}-${value}`)
        .join("-")
    : "default";
  return sanitizeResourceName(`${pkgName}-egress-${selectorString}`);
}
