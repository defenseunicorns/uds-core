import { V1SecurityContext } from "@kubernetes/client-node";
import { Capability, PeprValidateRequest, a } from "pepr";

export type Ctx = {
  name?: string;
  ctx: V1SecurityContext;
};

export const policies = new Capability({
  name: "uds-core-policies",
  description:
    "Collection of core validation policies for Pods, ConfigMaps, and other Kubernetes resources.",
});

export const { Store, When } = policies;

// Returns all volumes in the pod
export function volumes(request: PeprValidateRequest<a.Pod>) {
  return request.Raw.spec?.volumes || [];
}

// Returns all containers in the pod
export function containers(request: PeprValidateRequest<a.Pod>) {
  return [
    ...(request.Raw.spec?.containers || []),
    ...(request.Raw.spec?.initContainers || []),
    ...(request.Raw.spec?.ephemeralContainers || []),
  ];
}

/**
 * Returns all containers in the pod that have a securityContext
 *
 * @param request
 * @returns Map of container name to securityContext
 */
export function securityContextContainers(request: PeprValidateRequest<a.Pod>) {
  return containers(request)
    .filter(c => c.securityContext)
    .map(
      c =>
        ({
          name: c.name,
          ctx: c.securityContext!,
        }) as Ctx,
    );
}

export function securityContextMessage(
  msg: string,
  authorized: (string | undefined)[],
  ctx: Ctx[],
) {
  const violations = ctx.map(c => JSON.stringify(c)).join(" | ");
  return `${msg}. Authorized: [${authorized}] Found: ${violations}`;
}
