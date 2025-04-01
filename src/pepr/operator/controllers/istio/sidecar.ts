/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { V1OwnerReference } from "@kubernetes/client-node";
import { IstioSidecar, IstioOutboundTrafficPolicyMode, RemoteProtocol } from "../../crd";
import { sanitizeResourceName } from "../utils";

/**
 * Creates a Sidecar to enforce outbound traffic policies
 *
 * @param host
 * @param protocol
 * @param port
 * @param pkgName
 * @param namespace
 * @param generation
 * @param ownerRefs
 */
export function generateEgressSidecar(
  host: string,
  protocol: RemoteProtocol,
  port: number,
  selector: Record<string, string> | undefined,
  pkgName: string,
  namespace: string,
  generation: string,
  ownerRefs: V1OwnerReference[],
) {
  const name = generateEgressName(pkgName, port, protocol, host);

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

function generateEgressName(
  pkgName: string,
  port: number,
  protocol: string,
  host: string,
) {
  return sanitizeResourceName(`${pkgName}-egress-${protocol}-${port.toString()}-${host}`);
}
