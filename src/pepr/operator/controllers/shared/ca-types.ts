/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

export interface CABundleConfig {
  certs: string;
  includeDoDCerts: boolean;
  includePublicCerts: boolean;
  dodCerts: string;
  publicCerts: string;
}

export interface Config {
  domain: string;
  adminDomain: string;
  caBundle: CABundleConfig;
  authserviceRedisUri: string;
  allowAllNSExemptions: boolean;
  kubeApiCIDR: string;
  kubeNodeCIDRs: string[];
  isIdentityDeployed: boolean;
}
