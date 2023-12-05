import { a } from "pepr";

import { V1SecurityContext } from "@kubernetes/client-node";
import { When, containers, securityContextContainers, securityContextMessage } from "./common";
import {
  exemptDropAllCapabilities,
  exemptPrivileged,
  exemptSELinuxTypes,
} from "./exemptions/security";

/**
 * This policy ensures that Pods do not allow privilege escalation.
 *
 * The `allowPrivilegeEscalation` field in a container's security context should either be undefined
 * or set to `false` to prevent potential security vulnerabilities.
 *
 * Running containers in privileged mode disables many security mechanisms and grants extensive
 * access to host resources, which can lead to security breaches.
 *
 * @related https://repo1.dso.mil/big-bang/product/packages/kyverno-policies/-/blob/main/chart/templates/disallow-privilege-escalation.yaml
 * @related https://repo1.dso.mil/big-bang/product/packages/kyverno-policies/-/blob/main/chart/templates/disallow-privileged-containers.yaml
 */
When(a.Pod)
  .IsCreatedOrUpdated()
  .Validate(request => {
    if (exemptPrivileged(request)) {
      return request.Approve();
    }

    const violations = securityContextContainers(request).filter(
      c => c.ctx.allowPrivilegeEscalation || c.ctx.privileged,
    );

    if (violations.length) {
      return request.Deny(
        securityContextMessage(
          "Privilege escalation is disallowed",
          ["allowPrivilegeEscalation = false", "privileged = false"],
          violations,
        ),
      );
    }

    return request.Approve();
  });

/**
 * Require Non-root User for Pods
 *
 * Following the least privilege principle, containers should not be run as root. This policy ensures
 * containers either have `runAsNonRoot` set to `true` or `runAsUser` > 0. It applies to security contexts
 * defined at both the Pod level and individual container levels (including initContainers and ephemeralContainers).
 *
 * @related https://repo1.dso.mil/big-bang/product/packages/kyverno-policies/-/blob/main/chart/templates/require-non-root-user.yaml
 */
When(a.Pod)
  .IsCreatedOrUpdated()
  .Mutate(request => {
    if (exemptPrivileged(request)) {
      return;
    }

    const pod = request.Raw.spec!;

    // Ensure the securityContext field is defined
    pod.securityContext = pod.securityContext || {};

    // Set the runAsNonRoot field to true if it is undefined
    if (pod.securityContext.runAsNonRoot === undefined) {
      pod.securityContext.runAsNonRoot = true;
    }

    // Set the runAsUser field to 1000 if it is undefined
    if (pod.securityContext.runAsUser === undefined) {
      pod.securityContext.runAsUser = 1000;
    }

    // Set the runAsGroup field to 1000 if it is undefined
    if (pod.securityContext.runAsGroup === undefined) {
      pod.securityContext.runAsGroup = 1000;
    }
  })
  .Validate(request => {
    if (exemptPrivileged(request)) {
      return request.Approve();
    }

    // Check if running as root by checking if runAsNonRoot is false or runAsUser is 0
    const isRoot = (ctx: Partial<V1SecurityContext>) => {
      const isRunAsRoot = ctx.runAsNonRoot === false;
      const isRunAsRootUser = ctx.runAsUser === 0;

      return isRunAsRoot || isRunAsRootUser;
    };

    // Check pod securityContext
    const podCtx = request.Raw.spec?.securityContext || {};
    if (isRoot(podCtx)) {
      return request.Deny("Pod level securityContext does not meet the non-root user requirement.");
    }

    // Check container securityContext
    const violations = securityContextContainers(request).filter(c => isRoot(c.ctx));

    if (violations.length) {
      return request.Deny(
        securityContextMessage(
          "Unauthorized container securityContext. Containers must not run as root",
          ["runAsNonRoot = false", "runAsUser > 0"],
          violations,
        ),
      );
    }

    return request.Approve();
  });

/**
 * Restrict Proc Mount in Pods
 *
 * The default /proc masks are set up to reduce the attack surface. This policy
 * ensures nothing but the specified procMount can be used. By default only "Default"
 * is allowed. Applies to all containers, initContainers, and ephemeralContainers in a Pod.
 *
 * @related https://repo1.dso.mil/big-bang/product/packages/kyverno-policies/-/blob/main/chart/templates/restrict-proc-mount.yaml
 */
When(a.Pod)
  .IsCreatedOrUpdated()
  .Validate(request => {
    const authorized = [undefined, "Default"];

    const violations = securityContextContainers(request).filter(
      c => !authorized.includes(c.ctx.procMount),
    );

    if (violations.length) {
      return request.Deny(
        securityContextMessage("Unauthorized procMount type", authorized, violations),
      );
    }

    return request.Approve();
  });

/**
 * Restrict Seccomp in Pods
 *
 * The SecComp profile should not be explicitly set to Unconfined. This policy ensures
 * that the `seccompProfile.Type` is undefined or restricted to `RuntimeDefault` or
 * `Localhost`. Applies to Pods and all types of containers within them.
 *
 * @related https://repo1.dso.mil/big-bang/product/packages/kyverno-policies/-/blob/main/chart/templates/restrict-seccomp.yaml
 */
When(a.Pod)
  .IsCreatedOrUpdated()
  .Validate(request => {
    const authorized = [undefined, "RuntimeDefault", "Localhost"];

    // Check Pod level security context
    const ctx = request.Raw.spec?.securityContext || {};
    if (!authorized.includes(ctx.seccompProfile?.type)) {
      return request.Deny(
        securityContextMessage("Unauthorized pod seccomp profile type", authorized, [{ ctx }]),
      );
    }

    const violations = securityContextContainers(request).filter(
      c => !authorized.includes(c.ctx.seccompProfile?.type),
    );

    if (violations.length) {
      return request.Deny(
        securityContextMessage(
          "Unauthorized container seccomp profile type",
          authorized,
          violations,
        ),
      );
    }

    return request.Approve();
  });

/**
 * Restrict SELinux Type in Pods
 *
 * SELinux options can be used to escalate privileges. This policy ensures that the
 * `seLinuxOptions` type field is set to either `container_t`, `container_init_t`, or
 * `container_kvm_t`. Applies to Pods and all types of containers within them.
 *
 * @related https://repo1.dso.mil/big-bang/product/packages/kyverno-policies/-/blob/main/chart/templates/restrict-selinux-type.yaml
 */
When(a.Pod)
  .IsCreatedOrUpdated()
  .Validate(request => {
    if (exemptSELinuxTypes(request)) {
      return request.Approve();
    }

    const authorized = [undefined, "container_t", "container_init_t", "container_kvm_t"];

    // Check Pod level security context
    const podSeLinuxType = request.Raw.spec?.securityContext?.seLinuxOptions?.type;
    if (!authorized.includes(podSeLinuxType)) {
      return request.Deny(
        securityContextMessage("Unauthorized pod SELinux type", authorized, [
          { ctx: request.Raw.spec?.securityContext as V1SecurityContext },
        ]),
      );
    }

    const violations = securityContextContainers(request).filter(
      c => !authorized.includes(c.ctx.seLinuxOptions?.type),
    );

    if (violations.length) {
      return request.Deny(
        securityContextMessage("Unauthorized container SELinux type", authorized, violations),
      );
    }

    return request.Approve();
  });

/**
 * Drop All Capabilities in Pods
 *
 * This policy ensures that all containers, initContainers, and ephemeralContainers in a Pod
 * explicitly specify `drop: ["ALL"]` in their securityContext capabilities. Capabilities permit
 * privileged actions without giving full root access. Dropping all capabilities and only adding
 * back those that are required increases the security posture of the Pod.
 *
 * @related https://repo1.dso.mil/big-bang/product/packages/kyverno-policies/-/blob/main/chart/templates/require-drop-all-capabilities.yaml
 */
When(a.Pod)
  .IsCreatedOrUpdated()
  .Mutate(request => {
    if (exemptDropAllCapabilities(request)) {
      return;
    }

    // Always set drop: ["ALL"] for all containers
    for (const container of containers(request)) {
      container.securityContext = container.securityContext || {};
      container.securityContext.capabilities = container.securityContext.capabilities || {};
      container.securityContext.capabilities.drop = ["ALL"];
    }
  })
  .Validate(request => {
    if (exemptDropAllCapabilities(request)) {
      return request.Approve();
    }

    const authorized = "ALL";

    const violations = securityContextContainers(request).filter(c => {
      return !c.ctx.capabilities?.drop?.includes(authorized);
    });

    if (violations.length) {
      return request.Deny(
        securityContextMessage(
          "Unauthorized container DROP capabilities in securityContext.capabilities.drop",
          [authorized],
          violations,
        ),
      );
    }

    return request.Approve();
  });

/**
 * Restrict Capabilities in Pods
 *
 * This policy ensures that users cannot add additional capabilities beyond the allowed list to a Pod.
 * The allowed capability in this policy is 'NET_BIND_SERVICE'. The policy checks that the `add` field
 * in the `capabilities` of the `securityContext` for all containers, initContainers, and ephemeralContainers
 * contains only the allowed capability. This helps in preventing the escalation of privileges by restricting
 * the capabilities that can be added to a container.
 *
 * @related https://repo1.dso.mil/big-bang/product/packages/kyverno-policies/-/blob/main/chart/templates/restrict-capabilities.yaml
 */
When(a.Pod)
  .IsCreatedOrUpdated()
  .Validate(request => {
    const authorized = ["NET_BIND_SERVICE"];

    const violations = securityContextContainers(request).filter(
      c => c.ctx?.capabilities?.add && !c.ctx?.capabilities.add.includes(authorized[0]),
    );

    if (violations.length) {
      return request.Deny(
        securityContextMessage(
          "Unauthorized container capabilities in securityContext.capabilities.add",
          authorized,
          violations,
        ),
      );
    }

    return request.Approve();
  });
