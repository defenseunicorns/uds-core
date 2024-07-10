import { K8s, Log } from "pepr";
import { UDSConfig } from "../../../../config";
import { Action, AuthorizationPolicy, RequestAuthentication, UDSPackage } from "../../../crd";
import { getOwnerRef } from "../../utils";
import { Action as AuthServiceAction, AuthServiceEvent } from "./types";

const operationMap: {
  [AuthServiceAction.Add]: "Apply";
  [AuthServiceAction.Remove]: "Delete";
} = {
  [AuthServiceAction.Add]: "Apply",
  [AuthServiceAction.Remove]: "Delete",
};

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
          audiences: [name],
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

async function updatePolicy(
  event: AuthServiceEvent,
  labelSelector: { [key: string]: string },
  pkg: UDSPackage,
) {
  // type safe map event to operation (either Apply or Delete)
  const operation = operationMap[event.action];
  const namespace = pkg.metadata!.namespace!;
  const generation = (pkg.metadata?.generation ?? 0).toString();
  const ownerReferences = getOwnerRef(pkg);

  const updateMetadata = (resource: AuthorizationPolicy | RequestAuthentication) => {
    resource!.metadata!.name = resource!.metadata!.name + "-" + generation;
    resource!.metadata!.ownerReferences = ownerReferences;
    resource!.metadata!.labels = {
      "uds/package": pkg.metadata!.name!,
      "uds/generation": generation,
    };
    return resource;
  };

  try {
    await K8s(AuthorizationPolicy)[operation](
      updateMetadata(authserviceAuthorizationPolicy(labelSelector, event.name, namespace)),
    );
    await K8s(RequestAuthentication)[operation](
      updateMetadata(authNRequestAuthentication(labelSelector, event.name, namespace)),
    );
    await K8s(AuthorizationPolicy)[operation](
      updateMetadata(jwtAuthZAuthorizationPolicy(labelSelector, event.name, namespace)),
    );
  } catch (e) {
    Log.error(e, `Failed to update auth policy for ${event.name} in ${namespace}: ${e}`);
    throw new Error(`Failed to update auth policy for ${event.name} in ${namespace}: ${e}`, { cause: e });
  }

  try {
    await purgeOrphanPolicies(generation, namespace, pkg.metadata!.name!);
  } catch (e) {
    Log.error(e, `Failed to purge orphan auth policies ${event.name} in ${namespace}: ${e}`);
  }
}

async function purgeOrphanPolicies(generation: string, namespace: string, pkgName: string) {
  for (const kind of [AuthorizationPolicy, RequestAuthentication]) {
    const resources = await K8s(kind)
      .InNamespace(namespace)
      .WithLabel("uds/package", pkgName)
      .Get();

    for (const resource of resources.items) {
      if (resource.metadata?.labels?.["uds/generation"] !== generation) {
        Log.debug(resource, `Deleting orphaned ${resource.kind!} ${resource.metadata!.name}`);
        await K8s(kind).Delete(resource);
      }
    }
  }
}

export { updatePolicy };
