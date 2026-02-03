/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { UDSPackage } from "../../../../crd";
import { AddOrRemoveClientEvent, AuthserviceConfig } from "../types";

export interface AuthserviceConfigManager {
  getAuthserviceConfig(): Promise<AuthserviceConfig>;
  setAuthserviceConfig(config: AuthserviceConfig): void;
  updateAuthServiceSecret(config: AuthserviceConfig, checksum?: boolean): Promise<void>;
}

export interface AuthservicePolicyManager {
  updatePolicy(
    event: AddOrRemoveClientEvent,
    labelSelector: { [key: string]: string },
    pkg: UDSPackage,
    isAmbient?: boolean,
    waypointName?: string,
  ): Promise<void>;
}

export interface AuthserviceOperatorConfig {
  namespace: string;
  secretName: string;
  baseDomain: string;
  realm: string;
}
