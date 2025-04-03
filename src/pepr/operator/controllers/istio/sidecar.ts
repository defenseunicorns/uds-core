/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { V1OwnerReference } from "@kubernetes/client-node";
import { IstioSidecar, IstioOutboundTrafficPolicyMode } from "../../crd";
import { sanitizeResourceName } from "../utils";
import { HostPortsProtocol } from "./types";

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
  hostPortsProtocol: HostPortsProtocol,
  selector: Record<string, string> | undefined,
  pkgName: string,
  namespace: string,
  generation: string,
  ownerRefs: V1OwnerReference[],
) {
  const { host, ports, protocol } = hostPortsProtocol;

  const name = generateEgressName(pkgName, ports, protocol, host);

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

function generateEgressName(pkgName: string, ports: number[], protocol: string, host: string) {
  const portString = ports.join("-");
  return sanitizeResourceName(`${pkgName}-egress-${protocol}-${portString}-${host}`);
}
