/**
 * Copyright 2025-2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

export type CABundle = {
  certs: string; // Base64 encoded PEM bundle of user provided CA certificates
  includeDoDCerts: boolean; // Whether to include DoD CA certificates in overall trust bundle
  includePublicCerts: boolean; // Whether to include public CA certificates in overall trust bundle
  dodCerts?: string; // Base64 encoded PEM bundle of DoD CA certificates
  publicCerts?: string; // Base64 encoded PEM bundle of public CA certificates
};

export type FeatureFlags = {
  networkPolicies: boolean;
  authorizationPolicies: boolean;
  istioInjection: boolean;
  istioIngress: boolean;
  istioEgress: boolean;
  sso: boolean; // keycloak + authservice + purgeSSOClients
  podMonitors: boolean;
  serviceMonitors: boolean;
  uptimeProbes: boolean;
  caBundle: boolean;
};

export type Config = {
  domain: string;
  adminDomain: string;
  caBundle: CABundle;
  authserviceRedisUri: string;
  allowAllNSExemptions: boolean;
  kubeApiCIDR: string;
  kubeNodeCIDRs: string[];
  isIdentityDeployed: boolean;
  featureFlags: FeatureFlags;
};
