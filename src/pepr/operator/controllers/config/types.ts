/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

export type Config = {
  domain: string;
  adminDomain: string;
  caCert: string;
  authserviceRedisUri: string;
  allowAllNSExemptions: boolean;
  kubeApiCIDR: string;
  kubeNodeCIDRs: string[];
  isIdentityDeployed: boolean;
};
