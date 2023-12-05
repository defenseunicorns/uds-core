import { V1SecurityContext, V1Container } from "@kubernetes/client-node";
import { Capability, PeprMutateRequest, PeprValidateRequest, a } from "pepr";

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
export function containers(request: PeprValidateRequest<a.Pod> | PeprMutateRequest<a.Pod>) {
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
    .filter(c => !isIstioInitContainer(request, c))
    .map(c => ({ name: c.name, ctx: c.securityContext! }) as Ctx);
}

export function securityContextMessage(
  msg: string,
  authorized: (string | undefined)[],
  ctx: Ctx[],
) {
  const violations = ctx.map(c => JSON.stringify(c)).join(" | ");
  const authMsg = authorized.filter(a => a).join(" | ");

  return `${msg}. Authorized: [${authMsg}] Found: ${violations}`;
}

/**
 * Returns true if the container looks like an istio init container
 *
 * @param request the request to check
 * @param container the container to check
 * @returns
 */
export function isIstioInitContainer(
  request: PeprValidateRequest<a.Pod> | PeprMutateRequest<a.Pod>,
  container?: V1Container,
) {
  // Check for the sidecar.istio.io/status annotation
  const hasAnnotation = request.HasAnnotation("sidecar.istio.io/status");
  if (!hasAnnotation) {
    return false;
  }

  // Check for what looks like an istio sidecar
  const possibleSidecar = request.Raw.spec?.containers?.find(
    c =>
      c.name === "istio-proxy" &&
      c.ports?.find(p => p.name === "http-envoy-prom") &&
      c.args?.includes("proxy"),
  );
  if (!possibleSidecar) {
    return false;
  }

  // Check for what looks like an istio init container
  const possibleInitContainer =
    container?.name === "istio-init" && container.args?.includes("istio-iptables");
  if (!possibleInitContainer) {
    return false;
  }

  // If we get here, it's an istio init container
  return true;
}
