/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import {
  AuthserviceConfigManager,
  AuthservicePolicyManager,
  AuthserviceOperatorConfig,
} from "./interfaces";

let configManager: AuthserviceConfigManager | null = null;
let policyManager: AuthservicePolicyManager | null = null;
let operatorConfig: AuthserviceOperatorConfig | null = null;

export function setAuthserviceConfigManager(manager: AuthserviceConfigManager) {
  configManager = manager;
}

export function setAuthservicePolicyManager(manager: AuthservicePolicyManager) {
  policyManager = manager;
}

export function setAuthserviceOperatorConfig(config: AuthserviceOperatorConfig) {
  operatorConfig = config;
}

export function getAuthserviceConfigManager(): AuthserviceConfigManager {
  if (!configManager) {
    throw new Error("AuthserviceConfigManager not registered");
  }
  return configManager;
}

export function getAuthservicePolicyManager(): AuthservicePolicyManager {
  if (!policyManager) {
    throw new Error("AuthservicePolicyManager not registered");
  }
  return policyManager;
}

export function getAuthserviceOperatorConfig(): AuthserviceOperatorConfig {
  if (!operatorConfig) {
    throw new Error("AuthserviceOperatorConfig not registered");
  }
  return operatorConfig;
}
