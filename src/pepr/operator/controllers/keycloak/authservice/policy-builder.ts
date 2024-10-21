/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { UDSConfig } from "../../../../config";
import { IstioAction, IstioAuthorizationPolicy, IstioRequestAuthentication } from "../../../crd";
import { sanitizeResourceName } from "../../utils";

/**
 * Generates an Istio AuthorizationPolicy for the authservice.
 *
 * @param labelSelector - A dictionary of label key-value pairs to match the policy to specific resources.
 * @param clientId - The client identifier used to name the AuthorizationPolicy resource.
 * @returns An IstioAuthorizationPolicy object configured for the authservice.
 */
export function authserviceAuthorizationPolicy(
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

/**
 * Generates an Istio AuthorizationPolicy for JWT authentication and authorization.
 *
 * @param labelSelector - A key-value pair object used to match labels for the selector.
 * @param clientId - The client ID used to generate the policy name.
 * @returns An IstioAuthorizationPolicy object configured for JWT authentication and authorization.
 */
export function jwtAuthZAuthorizationPolicy(
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

/**
 * Generates an Istio RequestAuthentication resource for a given client ID and label selector.
 *
 * @param labelSelector - A dictionary of key-value pairs used to select the target resources.
 * @param clientId - The client ID for which the authentication policy is being created.
 * @returns An IstioRequestAuthentication object configured with the provided client ID and label selector.
 */
export function authNRequestAuthentication(
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

/**
 * Generates a default deny authorization policy for Istio.
 *
 * @param labelSelector - An object containing key-value pairs used to match labels.
 * @param clientId - The client identifier used to generate the policy name.
 * @returns An IstioAuthorizationPolicy object that denies all access.
 */
export function defaultDenyAuthorizationPolicy(
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
