import { K8s, Log } from "pepr";
import { Action, AuthorizationPolicy, RequestAuthentication, UDSPackage } from "../../../crd";
import { getOwnerRef } from "../../utils";
import { Action as AuthServiceAction, AuthServiceEvent } from "./types";

function authserviceAuthorizationPolicy(
  labelSelector: { [key: string]: string },
  name: string,
  namespace: string,
): AuthorizationPolicy {
  return {
    kind: "AuthorizationPolicy",
    metadata: {
      name: `${name}-authservice`,
      namespace,
    },
    spec: {
      action: Action.Custom,
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
  name: string,
  namespace: string,
): AuthorizationPolicy {
  return {
    kind: "AuthorizationPolicy",
    metadata: {
      name: `${name}-jwt-authz`,
      namespace,
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
                requestPrincipals: ["https://sso.uds.dev/realms/uds/*"],
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
  name: string,
  namespace: string,
): RequestAuthentication {
  return {
    kind: "RequestAuthentication",
    metadata: {
      name: `${name}-jwt-authn`,
      namespace,
    },
    spec: {
      jwtRules: [
        {
          forwardOriginalToken: true,
          issuer: "https://sso.uds.dev/realms/uds",
          jwksUri: "https://sso.uds.dev/realms/uds/protocol/openid-connect/certs",
        },
      ],
      selector: {
        matchLabels: labelSelector,
      },
    },
  };
}

async function updatePolicy(
  event: AuthServiceEvent,
  labelSelector: { [key: string]: string },
  pkg: UDSPackage,
) {
  const operation = event.action === AuthServiceAction.Add ? "Apply" : "Delete";
  const namespace = pkg.metadata!.namespace!;
  const generation = (pkg.metadata?.generation ?? 0).toString();
  const ownerReferences = getOwnerRef(pkg);
  const getKind = (kind: string | undefined) => {
    return kind && kind === "RequestAuthentication" ? RequestAuthentication : AuthorizationPolicy;
  };

  try {
    [
      authserviceAuthorizationPolicy(labelSelector, event.name, namespace),
      authNRequestAuthentication(labelSelector, event.name, namespace),
      jwtAuthZAuthorizationPolicy(labelSelector, event.name, namespace),
    ].forEach(async p => {
      p!.metadata!.ownerReferences = ownerReferences;
      p!.metadata!.labels = {
        "uds/package": pkg.metadata!.name!,
        "uds/generation": generation,
      };
      const kind = getKind(p.kind);
      await K8s(kind)[operation](p);
    });
  } catch (e) {
    Log.error(e, `Failed to update auth policy for ${event.name} in ${namespace}: ${e}`);
  }
}

export { updatePolicy };
