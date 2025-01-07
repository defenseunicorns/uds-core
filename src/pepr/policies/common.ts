/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { KubernetesObject, V1Container, V1SecurityContext } from "@kubernetes/client-node";
import { Capability, PeprMutateRequest, PeprValidateRequest, a } from "pepr";
import { Policy } from "../operator/crd";

export type Ctx = {
  name?: string;
  ctx: V1SecurityContext;
};

export const policies = new Capability({
  name: "uds-core-policies",
  description:
    "Collection of core validation policies for Pods, ConfigMaps, and other Kubernetes resources.",
});

export const { When } = policies;

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
  if (!request.HasAnnotation("sidecar.istio.io/status")) {
    return false;
  }

  // Check only initContainers for an Istio proxy presence and validate the image
  const hasInitContainerSidecar = request.Raw.spec?.initContainers?.some(
    c =>
      c.name === "istio-proxy" && c.args?.includes("proxy") && c.image?.includes("istio/proxyv2"),
  );

  // Exit if no Istio proxy is found in initContainers
  if (!hasInitContainerSidecar) {
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

function transform(policy: Policy) {
  return policy
    .split(/(?=[A-Z])/)
    .join("-")
    .toLowerCase();
}

export function annotateMutation<T extends KubernetesObject>(
  request: PeprMutateRequest<T>,
  policy: Policy,
) {
  const key = "uds-core.pepr.dev/mutated";
  const annotations = request.Raw.metadata?.annotations ?? {};
  const valStr = annotations[key];
  const arr = JSON.parse(valStr || "[]");
  const safePolicyName = transform(policy);
  if (!arr.includes(safePolicyName)) {
    arr.push(safePolicyName);
  }
  request.SetAnnotation(key, JSON.stringify(arr));
}
