/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { V1Container, V1PodSpec, V1ServiceSpec } from "@kubernetes/client-node";
import { a, sdk } from "pepr";

import { Policy } from "../operator/crd/index.js";
import { When } from "./common.js";
import { isExempt, markExemption } from "./exemptions/index.js";

const { containers } = sdk;
/**
 * This policy prevents pods from sharing the host namespaces.
 *
 * Host namespaces (Process ID namespace, Inter-Process Communication namespace, and network namespace)
 * allow access to shared information and can be used to elevate privileges. Pods should not be allowed
 * access to host namespaces. This policy ensures fields which make use of these host namespaces are
 * set to `false`.
 *
 * @related https://repo1.dso.mil/big-bang/product/packages/kyverno-policies/-/blob/main/chart/templates/disallow-host-namespaces.yaml
 */
When(a.Pod)
  .IsCreatedOrUpdated()
  .Mutate(markExemption(Policy.DisallowHostNamespaces))
  .Validate(request => {
    if (isExempt(request, Policy.DisallowHostNamespaces)) {
      return request.Approve();
    }

    const podSpec = request.Raw.spec!;
    const isValid = checkNoHostNamespaces(podSpec);

    if (isValid) {
      return request.Approve();
    } else {
      return request.Deny(
        "Sharing the host namespaces is disallowed. The fields spec.hostNetwork, spec.hostIPC, and spec.hostPID must not be set to true.",
      );
    }
  });

/**
 * Checks if a pod spec is using host namespaces
 */
export function checkNoHostNamespaces(pod: V1PodSpec): boolean {
  // If the pod is using the host network, IPC, or PID namespaces, it's invalid
  if (pod.hostNetwork || pod.hostIPC || pod.hostPID) {
    return false;
  }
  return true;
}

/**
 * This policy restricts the use of host ports in Pods.
 *
 * Access to host ports can allow potential snooping of network traffic and should be
 * restricted to a known list. This policy ensures only approved ports
 * are defined in container's `hostPort` field.
 *
 * @related https://repo1.dso.mil/big-bang/product/packages/kyverno-policies/-/blob/main/chart/templates/restrict-host-ports.yaml
 */
When(a.Pod)
  .IsCreatedOrUpdated()
  .Mutate(markExemption(Policy.RestrictHostPorts))
  .Validate(request => {
    if (isExempt(request, Policy.RestrictHostPorts)) {
      return request.Approve();
    }

    const containerList = containers(request);
    const isValid = checkNoHostPorts(containerList);

    if (isValid) {
      return request.Approve();
    } else {
      return request.Deny(`Host ports are not allowed.`);
    }
  });

/**
 * Checks if any containers in the pod are using host ports
 */
export function checkNoHostPorts(containerList: V1Container[]): boolean {
  // Check if any container has a host port
  const hasHostPort = containerList.flatMap(c => c.ports || []).find(p => p.hostPort);

  // If a container has a host port, it's invalid
  return !hasHostPort;
}

/**
 * This policy restricts the use of external names in services to mitigate the risk of MITM attacks.
 *
 * Service external names can be exploited by attackers to redirect traffic to malicious locations.
 *
 * @related https://repo1.dso.mil/big-bang/product/packages/kyverno-policies/-/blob/main/chart/templates/restrict-external-names.yaml
 */
When(a.Service)
  .IsCreatedOrUpdated()
  .Mutate(markExemption(Policy.RestrictExternalNames))
  .Validate(request => {
    if (isExempt(request, Policy.RestrictExternalNames)) {
      return request.Approve();
    }

    const isValid = checkNotExternalNameService(request.Raw.spec);

    if (isValid) {
      return request.Approve();
    } else {
      return request.Deny("ExternalName services are not allowed.");
    }
  });

/**
 * Checks if a service is using ExternalName type
 */
export function checkNotExternalNameService(serviceSpec: V1ServiceSpec | undefined): boolean {
  return serviceSpec?.type !== "ExternalName";
}

/**
 * This policy prevents the use of NodePort services in Kubernetes.
 *
 * NodePort services can pose security risks as they use a host port to receive traffic,
 * which cannot be controlled by a NetworkPolicy. This policy ensures that Services
 * do not use the NodePort type for enhanced security.
 *
 * @related https://repo1.dso.mil/big-bang/product/packages/kyverno-policies/-/blob/main/chart/templates/disallow-nodeport-services.yaml
 */
When(a.Service)
  .IsCreatedOrUpdated()
  .Mutate(markExemption(Policy.DisallowNodePortServices))
  .Validate(request => {
    if (isExempt(request, Policy.DisallowNodePortServices)) {
      return request.Approve();
    }

    const isValid = checkNotNodePortService(request.Raw.spec);

    if (isValid) {
      return request.Approve();
    } else {
      return request.Deny("NodePort services are not allowed.");
    }
  });

/**
 * Checks if a service is using NodePort type
 */
export function checkNotNodePortService(serviceSpec: V1ServiceSpec | undefined): boolean {
  return serviceSpec?.type !== "NodePort";
}
