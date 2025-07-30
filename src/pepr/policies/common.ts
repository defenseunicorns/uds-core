/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { KubernetesObject, V1Container, V1SecurityContext } from "@kubernetes/client-node";
import { Capability, K8s, PeprMutateRequest, PeprValidateRequest, a, kind, sdk } from "pepr";
import { Component, setupLogger } from "../logger";
import { Policy } from "../operator/crd";

const { containers } = sdk;
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

const log = setupLogger(Component.POLICIES);

// Track the registry used by the Pepr pods (zarf registry)
let currentImageRegistry: string;

// Initialize variables needed for processing
export async function initPolicyVariables() {
  if (process.env.PEPR_WATCH_MODE === "false" || process.env.PEPR_MODE === "dev") {
    try {
      // Get all pods in the pepr-system namespace
      const pods = await K8s(kind.Pod).InNamespace("pepr-system").Get();

      // Use the first pod's image
      const image = pods.items?.[0]?.spec?.containers?.[0]?.image;

      if (!image) {
        throw new Error("No image found in pepr-system pods.");
      }

      const parsed = parseImageRef(image);

      if (!parsed) {
        throw new Error("Unable to parse the current registry from the pepr-system pods.");
      }
      currentImageRegistry = parsed.registry;
      log.debug(`Initialized Istio policy check variables with registry: ${currentImageRegistry}`);
    } catch (error) {
      log.error("Failed to initialize Istio policy check variables:", error);
      throw error;
    }
  }
}

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
    // Handle empty input
    const trimmed = imageRef.trim();
    if (trimmed === "") return null;

    // Remove any tag or digest
    const imageWithoutTag = trimmed.replace(/[@:][^/]+$/, "");

    // Split into parts by /
    const parts = imageWithoutTag.split("/");

    // Check if the first part is a registry (contains . or : or is 'localhost')
    const firstPart = parts[0];
    const isRegistry =
      firstPart.includes(".") || firstPart.includes(":") || firstPart === "localhost";

    let registry: string;
    let repository: string;

    if (isRegistry) {
      // First part is the registry (with optional port)
      registry = firstPart;
      // The rest is the repository path
      repository = parts.slice(1).join("/");

      // Handle case where there's no repository part
      if (!repository) {
        return null;
      }
    } else {
      // No registry specified, use default docker.io
      registry = "docker.io";
      repository = imageWithoutTag;

      // For docker.io, if there's no namespace, add 'library/'
      if (!repository.includes("/")) {
        repository = `library/${repository}`;
      }
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
        // Check if registry matches either the flavor's registry (connected environment) or the current pod's registry (zarf registry)
        return registry === config.registry || registry === currentImageRegistry;
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
