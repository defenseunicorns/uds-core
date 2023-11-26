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
      .flatMap(c => c.securityContext || {})
      .find(ctx => ctx.allowPrivilegeEscalation || ctx.privileged);

    if (hasPrivilegedContainer) {
      return request.Deny(
        "Privilege escalation is disallowed. The allowPrivilegeEscalation and privileged fields must be undefined or set to `false`.",
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
 */
When(a.Pod)
  .IsCreatedOrUpdated()
  .Validate(request => {
    // Check pod securityContext
    const podCtx = request.Raw.spec?.securityContext || {};
    if (podCtx.runAsNonRoot || podCtx.runAsUser) {
      return request.Deny("Pod level securityContext does not meet the non-root user requirement.");
    }

    // Check container securityContext
    const hasRootContainer = containers(request)
      .flatMap(c => c.securityContext || {})
      .find(ctx => ctx.runAsNonRoot || ctx.runAsUser);

    if (hasRootContainer) {
      return request.Deny(
        `Root user is not allowed. One or more containers in the Pod have a securityContext that does not meet the non-root user requirement.`,
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
 */
When(a.Pod)
  .IsCreatedOrUpdated()
  .Validate(request => {
    const hasOtherProcMount = containers(request)
      .flatMap(c => c.securityContext || {})
      .find(ctx => ctx.procMount !== "Default");

    if (hasOtherProcMount) {
      return request.Deny(`Changing the proc mount from the default is not allowed.`);
    }

    return request.Approve();
  });

/**
 * Restrict Seccomp in Pods
 *
 * The SecComp profile should not be explicitly set to Unconfined. This policy ensures
 * that the `seccompProfile.Type` is undefined or restricted to `RuntimeDefault` or
 * `Localhost`. Applies to Pods and all types of containers within them.
 */
When(a.Pod)
  .IsCreatedOrUpdated()
  .Validate(request => {
    const authorizedTyes = ["RuntimeDefault", "Localhost"];

    // Check Pod level security context
    const podProfileType = request.Raw.spec?.securityContext?.seccompProfile?.type || "";
    if (!authorizedTyes.includes(podProfileType)) {
      return request.Deny(`The seccomp profile at Pod level is not in the allowed list.`);
    }

    const hasOtherSecProfileType = containers(request)
      .flatMap(c => c.securityContext?.seccompProfile)
      .find(profile => !authorizedTyes.includes(profile?.type || ""));

    if (hasOtherSecProfileType) {
      return request.Deny(`Unauthorized seccomp profile type.`);
    }

    return request.Approve();
  });

/**
 * Restrict SELinux Type in Pods
 *
 * SELinux options can be used to escalate privileges. This policy ensures that the
 * `seLinuxOptions` type field is set to either `container_t`, `container_init_t`, or
 * `container_kvm_t`. Applies to Pods and all types of containers within them.
 */
When(a.Pod)
  .IsCreatedOrUpdated()
  .Validate(request => {
    const allowedSeLinuxTypes = ["container_t", "container_init_t", "container_kvm_t"];

    // Check Pod level security context
    const podSeLinuxType = request.Raw.spec?.securityContext?.seLinuxOptions?.type || "";
    if (!allowedSeLinuxTypes.includes(podSeLinuxType)) {
      return request.Deny(`Setting SELinux type at Pod level is restricted to the allowed list.`);
    }

    const hasOtherSELinuxType = containers(request)
      .flatMap(c => c.securityContext?.seLinuxOptions?.type)
      .find(t => !allowedSeLinuxTypes.includes(t || ""));

    if (hasOtherSELinuxType) {
      return request.Deny(`Unauthorized SELinux type.`);
    }

    return request.Approve();
  });
