export interface Client {
  clientId: string;
  surrogateAuthRequired: boolean;
  enabled: boolean;
  alwaysDisplayInConsole: boolean;
  clientAuthenticatorType: string;
  secret: string;
  registrationAccessToken: string;
  defaultRoles: string[];
  redirectUris: string[];
  webOrigins: string[];
  notBefore: number;
  bearerOnly: boolean;
  consentRequired: boolean;
  standardFlowEnabled: boolean;
  implicitFlowEnabled: boolean;
  directAccessGrantsEnabled: boolean;
  serviceAccountsEnabled: boolean;
  publicClient: boolean;
  frontchannelLogout: boolean;
  protocol: string;
  attributes: Record<string, string>;
  authenticationFlowBindingOverrides: Record<string, string>;
  fullScopeAllowed: boolean;
  nodeReRegistrationTimeout: number;
  defaultClientScopes: string[];
  optionalClientScopes: string[];
}
