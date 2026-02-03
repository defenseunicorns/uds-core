/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

export interface EgressResource {
  packages: string[];
  portProtocols: PortProtocol[];
}

export interface EgressResourceMap {
  [host: string]: EgressResource;
}

export interface HostResource {
  portProtocol: PortProtocol[];
}

export interface HostResourceMap {
  [host: string]: HostResource;
}

export interface PackageHostMap {
  [pkgId: string]: HostResourceMap;
}

export interface PortProtocol {
  port: number;
  protocol: string;
}

export interface MonitorExemption {
  port?: string;
  path?: string;
}
