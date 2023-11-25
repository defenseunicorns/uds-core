import { a } from "pepr";

import { When, containers } from "./common";

/**
 * This policy ensures that Pods do not allow privilege escalation.
 *
 * The `allowPrivilegeEscalation` field in a container's security context should either be undefined
 * or set to `false` to prevent potential security vulnerabilities.
 *
 * Running containers in privileged mode disables many security mechanisms and grants extensive
 * access to host resources, which can lead to security breaches.
 */
When(a.Pod)
  .IsCreatedOrUpdated()
  .Validate(request => {
    const hasPrivilegedContainer = containers(request)
      .flatMap(c => c.securityContext || [])
      .find(ctx => ctx.allowPrivilegeEscalation || ctx.privileged);

    if (hasPrivilegedContainer) {
      return request.Deny(
        "Privilege escalation is disallowed. The allowPrivilegeEscalation and privileged fields must be undefined or set to `false`.",
      );
    }

    return request.Approve();
  });
