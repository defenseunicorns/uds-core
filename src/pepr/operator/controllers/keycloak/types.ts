import { ProtocolMapper } from "../../crd/generated/package-v1alpha1";

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

// Define a constant array of keys
export const clientKeys = [
  "alwaysDisplayInConsole",
  "attributes",
  "authenticationFlowBindingOverrides",
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
