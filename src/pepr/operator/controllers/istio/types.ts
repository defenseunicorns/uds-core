/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */
import { RemoteProtocol } from "../../crd";

export type PackageHostMap = Record<string, HostResourceMap>;
export type HostResourceMap = Record<string, HostResource>;
export type EgressResourceMap = Record<string, EgressResource>;

export interface HostResource {
  portProtocol: PortProtocol[];
}

export interface HostPortsProtocol {
  host: string;
  ports: number[];
  protocol: RemoteProtocol;
}

export interface EgressResource {
  packages: string[];
  portProtocols: PortProtocol[];
}

export interface PortProtocol {
  port: number;
  protocol: RemoteProtocol;
}

export enum PackageAction {
  AddOrUpdate = "AddOrUpdatePackage",
  Remove = "RemovePackage",
}
