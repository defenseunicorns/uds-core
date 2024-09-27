import { UDSConfig } from "../../../../config";
import { IstioAction, IstioAuthorizationPolicy, IstioRequestAuthentication } from "../../../crd";
import { sanitizeResourceName } from "../../utils";

function authserviceAuthorizationPolicy(
  labelSelector: { [key: string]: string },
  clientId: string,
): IstioAuthorizationPolicy {
  return {
    kind: "AuthorizationPolicy",
    metadata: {
      name: sanitizeResourceName(`${clientId}-authservice`),
    },
    spec: {
      action: IstioAction.Custom,
      provider: {
        name: "authservice",
      },
      rules: [
        {
          when: [
            {
              key: "request.headers[authorization]",
              notValues: ["*"],
            },
          ],
        },
      ],
      selector: {
        matchLabels: labelSelector,
      },
    },
  };
}

function jwtAuthZAuthorizationPolicy(
  labelSelector: { [key: string]: string },
  clientId: string,
): IstioAuthorizationPolicy {
  return {
    kind: "AuthorizationPolicy",
    metadata: {
      name: sanitizeResourceName(`${clientId}-jwt-authz`),
    },
    spec: {
      selector: {
        matchLabels: labelSelector,
      },
      rules: [
        {
          from: [
            {
              source: {
                requestPrincipals: [`https://sso.${UDSConfig.domain}/realms/uds/*`],
              },
            },
          ],
        },
      ],
    },
  };
}

function authNRequestAuthentication(
  labelSelector: { [key: string]: string },
  clientId: string,
): IstioRequestAuthentication {
  return {
    kind: "RequestAuthentication",
    metadata: {
      name: sanitizeResourceName(`${clientId}-jwt-authn`),
    },
    spec: {
      jwtRules: [
        {
          audiences: [clientId],
          forwardOriginalToken: true,
          issuer: `https://sso.${UDSConfig.domain}/realms/uds`,
          jwksUri: `http://keycloak-http.keycloak.svc.cluster.local:8080/realms/uds/protocol/openid-connect/certs`,
        },
      ],
      selector: {
        matchLabels: labelSelector,
      },
    },
  };
}

function defaultDenyAuthorizationPolicy(
  labelSelector: { [key: string]: string },
  clientId: string,
): IstioAuthorizationPolicy {
  return {
    kind: "AuthorizationPolicy",
    metadata: {
      name: sanitizeResourceName(`${clientId}-allow-nothing`),
    },
    spec: {
      selector: {
        matchLabels: labelSelector,
      },
    },
  };
}

export {
  authNRequestAuthentication,
  authserviceAuthorizationPolicy,
  defaultDenyAuthorizationPolicy,
  jwtAuthZAuthorizationPolicy,
};
