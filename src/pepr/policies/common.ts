/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { KubernetesObject, V1Container, V1SecurityContext } from "@kubernetes/client-node";
import { Capability, PeprMutateRequest, PeprValidateRequest, a, sdk } from "pepr";
import { Component, setupLogger } from "../logger";
import { Policy } from "../operator/crd";

const { containers } = sdk;
export type Ctx = {
  name?: string;
  ctx: V1SecurityContext;
};

// @lulaStart 4d457410-a627-4f03-9d26-0556336df90d
export const policies = new Capability({
  name: "uds-core-policies",
  description:
    "Collection of core validation policies for Pods, ConfigMaps, and other Kubernetes resources.",
});

export const { When } = policies;
// @lulaEnd 4d457410-a627-4f03-9d26-0556336df90d

const log = setupLogger(Component.POLICIES);

// The default shouldn't be used, but is the default zarf registry in case our env doesn't get set as expected
const zarfRegistry = process.env.ZARF_REGISTRY_ADDRESS || "127.0.0.1:31999";

// Map of flavor to its expected registry and repository for Istio proxy image
const ISTIO_IMAGE_FLAVOR_CONFIGS = {
  upstream: {
    registry: "docker.io",
    repository: "istio/proxyv2",
  },
  registry1: {
    registry: "registry1.dso.mil",
    repository: "ironbank/tetrate/istio/proxyv2",
  },
  unicorn: {
    registry: "quay.io",
    repository: "rfcurated/istio/proxyv2",
  },
} as const;

/**
 * Parse an image reference into its registry and repository components
 */
export function parseImageRef(imageRef: string): { registry: string; repository: string } | null {
  if (!imageRef) return null;

  try {
    const trimmed = imageRef.trim();
    if (trimmed === "") return null;

    // Remove any tag or digest
    const imageWithoutTag = trimmed.replace(/[@:][^/]+$/, "");

    // Split on / - the repository section always starts with /
    const parts = imageWithoutTag.split("/");

    const firstPart = parts[0];
    // A registry must contain either `.`, `:`, or be `localhost`. Otherwise it is assumed this is `docker.io`.
    const isRegistry =
      firstPart.includes(".") || firstPart.includes(":") || firstPart === "localhost";

    let registry: string;
    let repository: string;

    if (isRegistry) {
      registry = firstPart;
      repository = parts.slice(1).join("/");

      // If there's no repository, this image is unparsable
      if (!repository) {
        return null;
      }
    } else {
      // No registry specified, use default `docker.io`
      registry = "docker.io";
      repository = imageWithoutTag;
    }

    return { registry, repository };
  } catch (error) {
    log.error(`Error parsing image reference '${imageRef}':`, error);
    return null;
  }
}

/**
 * Validate if an image is an allowed Istio proxy image
 */
export function validateIstioImage(imageString: string): boolean {
  try {
    const parsed = parseImageRef(imageString);
    if (!parsed) return false;

    const { registry, repository } = parsed;

    // Find matching flavor by repository
    for (const config of Object.values(ISTIO_IMAGE_FLAVOR_CONFIGS)) {
      if (config.repository === repository) {
        // Check if registry matches either the flavor's registry (connected environment) or the zarf registry
        return registry === config.registry || registry === zarfRegistry;
      }
    }

    return false;
  } catch (error) {
    log.error(`Error validating image ${imageString}:`, error);
    return false;
  }
}

// Returns all volumes in the pod
export function volumes(request: PeprValidateRequest<a.Pod>) {
  return request.Raw.spec?.volumes || [];
}

/**
 * Returns all containers in the pod that have a securityContext
 *
 * @param request
 * @returns Map of container name to securityContext
 */
export function securityContextContainers(
  request: PeprValidateRequest<a.Pod>,
  excludeIstioInit = false,
) {
  return containers(request)
    .filter(c => c.securityContext)
    .filter(c => !excludeIstioInit || !isIstioInitContainer(request, c)) // conditionally filter out istio init containers
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
 * Returns true if the container looks like an istio-init container
 *
 * @param request the request to check
 * @param container the container to check
 * @returns boolean
 */
export function isIstioInitContainer(
  request: PeprValidateRequest<a.Pod> | PeprMutateRequest<a.Pod>,
  container: V1Container,
) {
  // Check for the sidecar.istio.io/status annotation
  if (!request.HasAnnotation("sidecar.istio.io/status")) {
    return false;
  }

  // Check for an istio-proxy in initContainers (native sidecar)
  const hasSidecar = request.Raw.spec?.initContainers?.some(c => isIstioProxyContainer(c));

  // Exit if no istio-proxy is found in initContainers
  if (!hasSidecar) {
    return false;
  }

  // If the container doesn't have an image, we can't validate
  if (!container.image) {
    return false;
  }

  // Check if the provided container looks like an istio-init container
  const initContainer =
    container.name === "istio-init" &&
    container.args?.[0] === "istio-iptables" &&
    container.command === undefined &&
    validateIstioImage(container.image);

  return initContainer;
}

/**
 * Check if a container is an Istio proxy container
 * @param container the container to check
 * @returns boolean
 */
export function isIstioProxyContainer(container: V1Container): boolean {
  // If the container doesn't have an image, we can't validate
  if (!container.image) {
    return false;
  }

  // Check if the provided container looks like an istio-proxy container
  const isProxyContainer =
    container?.name === "istio-proxy" &&
    container.ports?.some(p => p.name === "http-envoy-prom") &&
    container.args?.[0] === "proxy" &&
    container.command === undefined;

  if (!isProxyContainer) {
    return false;
  }

  return validateIstioImage(container.image);
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
