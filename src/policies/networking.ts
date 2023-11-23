import { a } from "pepr";

import { When } from "./register";

/**
 * This policy prevents pods from sharing the host namespaces.
 *
 * Host namespaces (Process ID namespace, Inter-Process Communication namespace, and network namespace)
 * allow access to shared information and can be used to elevate privileges. Pods should not be allowed
 * access to host namespaces. This policy ensures fields which make use of these host namespaces are
 * set to `false`.
 */
When(a.Pod)
  .IsCreatedOrUpdated()
  .Validate(request => {
    const pod = request.Raw.spec!;

    // If the pod is using the host network, IPC, or PID namespaces, deny the request.
    if (pod.hostNetwork || pod.hostIPC || pod.hostPID) {
      return request.Deny(
        "Sharing the host namespaces is disallowed. The fields spec.hostNetwork, spec.hostIPC, and spec.hostPID must not be set to true.",
      );
    }

    return request.Approve();
  });
