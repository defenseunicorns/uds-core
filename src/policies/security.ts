import { a } from "pepr";

import { When, containers } from "./common";
import { exemptDropAllCapabilities, exemptSELinuxTypes } from "./exemptions/security";
import { V1SecurityContext } from "@kubernetes/client-node";

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
 *
 * @related https://repo1.dso.mil/big-bang/product/packages/kyverno-policies/-/blob/main/chart/templates/require-non-root-user.yaml
 */
When(a.Pod)
  .IsCreatedOrUpdated()
  .Mutate(request => {
    const pod = request.Raw.spec!;

    // Ensure the securityContext field is defined
    pod.securityContext = pod.securityContext || {};

    // Set the runAsNonRoot field to true if it is undefined
    if (pod.securityContext.runAsNonRoot === undefined) {
      pod.securityContext.runAsNonRoot = true;
    }
  })
  .Validate(request => {
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
    const hasRootContainer = containers(request)
      .flatMap(c => c.securityContext || {})
      .find(isRoot);

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
 *
 * @related https://repo1.dso.mil/big-bang/product/packages/kyverno-policies/-/blob/main/chart/templates/restrict-proc-mount.yaml
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
 *
 * @related https://repo1.dso.mil/big-bang/product/packages/kyverno-policies/-/blob/main/chart/templates/restrict-seccomp.yaml
 */
When(a.Pod)
  .IsCreatedOrUpdated()
  .Validate(request => {
    const authorizedTypes = ["RuntimeDefault", "Localhost"];

    // Check Pod level security context
    const podProfileType = request.Raw.spec?.securityContext?.seccompProfile?.type || "";
    if (!authorizedTypes.includes(podProfileType)) {
      return request.Deny(`The seccomp profile at Pod level is not in the allowed list.`);
    }

    const hasOtherSecProfileType = containers(request)
      .flatMap(c => c.securityContext?.seccompProfile)
      .find(profile => !authorizedTypes.includes(profile?.type || ""));

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
 *
 * @related https://repo1.dso.mil/big-bang/product/packages/kyverno-policies/-/blob/main/chart/templates/restrict-selinux-type.yaml
 */
When(a.Pod)
  .IsCreatedOrUpdated()
  .Validate(request => {
    if (exemptSELinuxTypes(request)) {
      return request.Approve();
    }

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
  .Validate(request => {
    if (exemptDropAllCapabilities(request)) {
      return request.Approve();
    }

    const hasInvalidCapabilities = containers(request)
      .flatMap(c => c.securityContext?.capabilities?.drop || [])
      .find(c => c !== "ALL");

    if (hasInvalidCapabilities) {
      return request.Deny(
        `Containers must drop all Linux capabilities by setting spec.containers[*].securityContext.capabilities.drop to 'ALL'.`,
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
    // Allowed capabilities list
    const allowedCapabilities = ["NET_BIND_SERVICE"];

    const hasInvalidCapabilities = containers(request)
      .flatMap(c => c.securityContext?.capabilities?.add || [])
      .find(c => !allowedCapabilities.includes(c));

    if (hasInvalidCapabilities) {
      return request.Deny(
        `Containers must not add capabilities other than the allowed list: ${allowedCapabilities}`,
      );
    }

    return request.Approve();
  });
