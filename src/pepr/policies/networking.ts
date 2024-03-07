import { a } from "pepr";

import { When, containers } from "./common";
import { Policy } from "../operator/crd";
import { isExempt, markExemption } from "./exemptions";

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

    const pod = request.Raw.spec!;

    // If the pod is using the host network, IPC, or PID namespaces, deny the request.
    if (pod.hostNetwork || pod.hostIPC || pod.hostPID) {
      return request.Deny(
        "Sharing the host namespaces is disallowed. The fields spec.hostNetwork, spec.hostIPC, and spec.hostPID must not be set to true.",
      );
    }

    return request.Approve();
  });

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

    // Check all containers in the pod spec, and find the first one that has a host port, if any
    const hasHostPort = containers(request)
      .flatMap(c => c.ports || [])
      .find(p => p.hostPort);

    // If the container has a host port, deny the request
    if (hasHostPort) {
      return request.Deny(`Host ports are not allowed.`);
    }

    return request.Approve();
  });

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
    if (request.Raw.spec?.type === "ExternalName") {
      return request.Deny("ExternalName services are not allowed.");
    }

    return request.Approve();
  });

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
    // If the service is of type NodePort, deny the request.
    if (request.Raw.spec?.type === "NodePort") {
      return request.Deny("NodePort services are not allowed.");
    }

    return request.Approve();
  });
