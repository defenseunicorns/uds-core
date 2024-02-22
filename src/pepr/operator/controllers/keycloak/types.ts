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
  publicClient: boolean;
  redirectUris: string[];
  registrationAccessToken?: string;
  secret: string;
  serviceAccountsEnabled: boolean;
  standardFlowEnabled: boolean;
  surrogateAuthRequired: boolean;
  webOrigins: string[];
}
