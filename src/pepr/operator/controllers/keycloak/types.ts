/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { ProtocolMapper } from "../../crd/generated/package-v1alpha1";

// An internal interface for sending Client Representation to Keycloak from the UDS Operator
// Should be as close as possible to the https://www.keycloak.org/docs-api/latest/rest-api/index.html#ClientRepresentation
export interface Client {
  alwaysDisplayInConsole: boolean;
  attributes: Record<string, string>;
  authenticationFlowBindingOverrides: Record<string, string>;
  bearerOnly: boolean;
  clientAuthenticatorType: string;
  clientId: string;
  consentRequired: boolean;
  defaultClientScopes: string[];
  defaultRoles: string[];
  directAccessGrantsEnabled: boolean;
  enabled: boolean;
  frontchannelLogout: boolean;
  fullScopeAllowed: boolean;
  implicitFlowEnabled: boolean;
  name: string;
  nodeReRegistrationTimeout: number;
  notBefore: number;
  optionalClientScopes: string[];
  protocol: string;
  protocolMappers?: ProtocolMapper[];
  publicClient: boolean;
  redirectUris: string[];
  registrationAccessToken?: string;
  secret: string;
  serviceAccountsEnabled: boolean;
  standardFlowEnabled: boolean;
  surrogateAuthRequired: boolean;
  webOrigins: string[];
  samlIdpCertificate?: string;
}

// Define a constant array of keys that will be used to convert
// Package CRD spec.sso part into the Keycloak Client representation
export const clientKeys = [
  "adminUrl",
  "alwaysDisplayInConsole",
  "attributes",
  "authenticationFlowBindingOverrides",
  "baseUrl",
  "bearerOnly",
  "clientAuthenticatorType",
  "clientId",
  "consentRequired",
  "defaultClientScopes",
  "defaultRoles",
  "directAccessGrantsEnabled",
  "enabled",
  "frontchannelLogout",
  "fullScopeAllowed",
  "implicitFlowEnabled",
  "name",
  "nodeReRegistrationTimeout",
  "notBefore",
  "optionalClientScopes",
  "protocol",
  "protocolMappers",
  "publicClient",
  "redirectUris",
  "registrationAccessToken",
  "secret",
  "serviceAccountsEnabled",
  "standardFlowEnabled",
  "surrogateAuthRequired",
  "webOrigins",
  "samlIdpCertificate",
] as const;
