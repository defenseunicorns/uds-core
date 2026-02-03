/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

export interface NetworkConfig {
  kubeApiCIDR: string;
  kubeNodeCIDRs: string[];
}

export interface NetworkConfigManager {
  getNetworkConfig(): NetworkConfig;
  initAPIServerCIDR(): Promise<void>;
  initAllNodesTarget(): Promise<void>;
}
