/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { RemoteProtocol } from "../../crd";

export function getAllowedPorts(allow: { ports?: number[]; port?: number }): number[] | undefined {
  if (Array.isArray(allow.ports) && allow.ports.length > 0) {
    return allow.ports;
  }
  if (typeof allow.port === "number") {
    return [allow.port];
  }
  return undefined;
}

export function getPortsForHostAllow(allow: {
  ports?: number[];
  port?: number;
  remoteProtocol?: RemoteProtocol;
}): number[] {
  const ports = getAllowedPorts(allow);
  if (ports) {
    return ports;
  }
  return allow.remoteProtocol === RemoteProtocol.HTTP ? [80] : [443];
}
