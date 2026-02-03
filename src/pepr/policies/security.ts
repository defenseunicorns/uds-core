/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { a, sdk } from "pepr";

import {
  V1Container,
  V1ObjectMeta,
  V1PodSecurityContext,
  V1PodSpec,
} from "@kubernetes/client-node";
import { Policy } from "../operator/crd/index.js";
import {
  Ctx,
  When,
  annotateMutation,
  securityContextContainers,
  securityContextMessage,
} from "./common.js";
import { exemptionAnnotationPrefix, isExempt, markExemption } from "./exemptions/index.js";

const { containers } = sdk;

// @lulaStart ede53ec3-fdb5-4cd5-a2b1-abcbe338b285
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
  .Mutate(request => {
    markExemption(Policy.DisallowPrivileged)(request);
    if (request.HasAnnotation(`${exemptionAnnotationPrefix}.${Policy.DisallowPrivileged}`)) {
      return;
    }

    if (setPrivilegeEscalation(containers(request))) {
      annotateMutation(request, Policy.DisallowPrivileged);
    }
  })
  .Validate(request => {
    if (isExempt(request, Policy.DisallowPrivileged)) {
      return request.Approve();
    }

    const violations = validatePrivilegeEscalation(securityContextContainers(request));
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
 * Sets allowPrivilegeEscalation to false for containers that meet the criteria:
 * - allowPrivilegeEscalation is undefined
 * - privileged is not true
 * - capabilities.add does not include CAP_SYS_ADMIN
 */
export function setPrivilegeEscalation(containers: V1Container[]): boolean {
  let wasMutated = false;

  for (const container of containers) {
    container.securityContext = container.securityContext || {};
    const shouldSetPrivilegeEscalation = [
      container.securityContext.allowPrivilegeEscalation === undefined,
      !container.securityContext.privileged,
      !container.securityContext.capabilities?.add?.includes("CAP_SYS_ADMIN"),
    ].every(Boolean);

    if (shouldSetPrivilegeEscalation) {
      container.securityContext.allowPrivilegeEscalation = false;
      wasMutated = true;
    }
  }

  return wasMutated;
}

/**
 * Validates that containers do not allow privilege escalation
 */
export function validatePrivilegeEscalation(containers: Ctx[]): Ctx[] {
  // Checking if allowPrivilegeEscalation is undefined. If yes, fallback to true as the default behavior in k8s is to allow if undefined.
  // Checks the three different ways a container could escalate to admin privs
  return containers.filter(c => (c.ctx.allowPrivilegeEscalation ?? true) || c.ctx.privileged);
}

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
    markExemption(Policy.RequireNonRootUser)(request);
    if (request.HasAnnotation(`${exemptionAnnotationPrefix}.${Policy.RequireNonRootUser}`)) {
      return;
    }

    setNonRootUserSettings(request.Raw.spec!, request.Raw.metadata!);
    annotateMutation(request, Policy.RequireNonRootUser);
  })
  .Validate(request => {
    if (isExempt(request, Policy.RequireNonRootUser)) {
      return request.Approve();
    }

    // Check pod securityContext
    const podCtx = request.Raw.spec?.securityContext || {};
    if (isRootSecurityContext(podCtx)) {
      return request.Deny("Pod level securityContext does not meet the non-root user requirement.");
    }

    // Check container securityContext, filter out istio-init containers
    const violations = securityContextContainers(request, true).filter(c =>
      isRootSecurityContext(c.ctx),
    );

    if (violations.length) {
      return request.Deny(
        securityContextMessage(
          "Unauthorized container securityContext. Containers must not run as root or have root-level supplemental groups",
          ["runAsNonRoot = true", "runAsUser > 0", "supplementalGroups must not include 0"],
          violations,
        ),
      );
    }

    return request.Approve();
  });

/**
 * Configures the pod security context to ensure it runs as a non-root user
 */
export function setNonRootUserSettings(pod: V1PodSpec, metadata: V1ObjectMeta) {
  // Ensure the securityContext field is defined
  pod.securityContext = pod.securityContext || {};

  // Set the runAsUser field if it is defined in a label
  const runAsUser = metadata.labels?.["uds/user"];
  if (runAsUser) {
    pod.securityContext.runAsUser = parseInt(runAsUser);
  }

  // Set the runAsGroup field if it is defined in a label
  const runAsGroup = metadata.labels?.["uds/group"];
  if (runAsGroup) {
    pod.securityContext.runAsGroup = parseInt(runAsGroup);
  }

  // Set the fsGroup field if it is defined in a label
  const fsGroup = metadata.labels?.["uds/fsgroup"];
  if (fsGroup) {
    pod.securityContext.fsGroup = parseInt(fsGroup);
  }

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
}

/**
 * Checks if a security context represents a root user
 */
export function isRootSecurityContext(ctx: Partial<V1PodSecurityContext>): boolean {
  const isRunAsRoot = ctx.runAsNonRoot === false;
  const isRunAsRootUser = ctx.runAsUser === 0;
  const hasRootSupplementalGroups = Boolean(ctx.supplementalGroups?.includes(0));

  return isRunAsRoot || isRunAsRootUser || hasRootSupplementalGroups;
}
// @lulaEnd ede53ec3-fdb5-4cd5-a2b1-abcbe338b285

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
  .Mutate(markExemption(Policy.RestrictProcMount))
  .Validate(request => {
    if (isExempt(request, Policy.RestrictProcMount)) {
      return request.Approve();
    }

    const authorized = [undefined, "Default"];
    const { violations } = validateProcMount(securityContextContainers(request), authorized);

    if (violations.length) {
      return request.Deny(
        securityContextMessage("Unauthorized procMount type", authorized, violations),
      );
    }

    return request.Approve();
  });

/**
 * Validates that procMount types are within the allowed set
 */
export function validateProcMount(
  containers: Ctx[],
  allowedTypes: (string | undefined)[],
): { violations: Ctx[]; isPodViolation: boolean } {
  // Check container level security contexts
  const containerViolations = containers.filter(
    c => c.ctx.procMount && !allowedTypes.includes(c.ctx.procMount),
  );

  return {
    violations: containerViolations,
    isPodViolation: false, // Always false since procMount is container-level only
  };
}

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
  .Mutate(markExemption(Policy.RestrictSeccomp))
  .Validate(request => {
    if (isExempt(request, Policy.RestrictSeccomp)) {
      return request.Approve();
    }

    const authorized = [undefined, "RuntimeDefault", "Localhost"];
    const { violations, isPodViolation } = validateSeccompProfile(
      request.Raw.spec?.securityContext,
      securityContextContainers(request),
      authorized,
    );

    if (violations.length) {
      const message = isPodViolation
        ? "Unauthorized pod seccomp profile type"
        : "Unauthorized container seccomp profile type";

      return request.Deny(securityContextMessage(message, authorized, violations));
    }

    return request.Approve();
  });

/**
 * Validates that seccomp profile types are within the allowed set
 */
export function validateSeccompProfile(
  podSecurityContext: V1PodSecurityContext | undefined,
  containers: Ctx[],
  allowedTypes: (string | undefined)[],
): { violations: Ctx[]; isPodViolation: boolean } {
  // Check pod level security context first
  const podSeccompType = podSecurityContext?.seccompProfile?.type;
  if (!allowedTypes.includes(podSeccompType)) {
    return {
      violations: [
        {
          name: "pod",
          ctx: podSecurityContext || {},
        },
      ],
      isPodViolation: true,
    };
  }

  // Check container level security contexts
  const containerViolations = containers.filter(
    c => !allowedTypes.includes(c.ctx.seccompProfile?.type),
  );

  return {
    violations: containerViolations,
    isPodViolation: false,
  };
}

/**
 * Disallow SELinux Options in Pods
 *
 * SELinux options can be used to escalate privileges. This policy ensures that the
 * `seLinuxOptions` user and role fields are set to undefined.
 * Applies to Pods and all types of containers within them.
 *
 * @related https://repo1.dso.mil/big-bang/product/packages/kyverno-policies/-/blob/main/chart/templates/disallow-selinux-options.yaml
 */
When(a.Pod)
  .IsCreatedOrUpdated()
  .Mutate(markExemption(Policy.DisallowSELinuxOptions))
  .Validate(request => {
    if (isExempt(request, Policy.DisallowSELinuxOptions)) {
      return request.Approve();
    }

    const authorized = ["user: undefined", "role: undefined"];
    const { violations, isPodViolation } = validateSELinuxOptions(
      request.Raw.spec?.securityContext,
      securityContextContainers(request),
    );

    if (violations.length) {
      const message = isPodViolation
        ? "Unauthorized pod SELinux Options"
        : "Unauthorized container SELinux Options";

      return request.Deny(securityContextMessage(message, authorized, violations));
    }

    return request.Approve();
  });

/**
 * Validates that SELinux user and role options are not set
 */
export function validateSELinuxOptions(
  podSecurityContext: V1PodSecurityContext | undefined,
  containers: Ctx[],
): { violations: Ctx[]; isPodViolation: boolean } {
  // Check pod level security context
  const seLinuxOptions = podSecurityContext?.seLinuxOptions;
  if (seLinuxOptions?.user || seLinuxOptions?.role) {
    return {
      violations: [
        {
          name: "pod",
          ctx: podSecurityContext || {},
        },
      ],
      isPodViolation: true,
    };
  }

  // Check container level security context
  const containerViolations = containers.filter(
    c => c.ctx.seLinuxOptions?.user || c.ctx.seLinuxOptions?.role,
  );

  return {
    violations: containerViolations,
    isPodViolation: false,
  };
}

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
  .Mutate(markExemption(Policy.RestrictSELinuxType))
  .Validate(request => {
    if (isExempt(request, Policy.RestrictSELinuxType)) {
      return request.Approve();
    }

    const authorized = [undefined, "container_t", "container_init_t", "container_kvm_t"];
    const { violations, isPodViolation } = validateSELinuxTypes(
      request.Raw.spec?.securityContext,
      securityContextContainers(request),
      authorized,
    );

    if (violations.length) {
      const message = isPodViolation
        ? "Unauthorized pod SELinux type"
        : "Unauthorized container SELinux type";

      return request.Deny(securityContextMessage(message, authorized, violations));
    }

    return request.Approve();
  });

/**
 * Validates that SELinux types are within the allowed set
 */
export function validateSELinuxTypes(
  podSecurityContext: V1PodSecurityContext | undefined,
  containers: Ctx[],
  authorizedTypes: (string | undefined)[],
): { violations: Ctx[]; isPodViolation: boolean } {
  // Check pod level security context first
  const podSeLinuxType = podSecurityContext?.seLinuxOptions?.type;
  if (!authorizedTypes.includes(podSeLinuxType)) {
    return {
      violations: [
        {
          name: "pod",
          ctx: podSecurityContext || {},
        },
      ],
      isPodViolation: true,
    };
  }

  // Only check containers if pod level passes
  const containerViolations = containers.filter(
    c => !authorizedTypes.includes(c.ctx.seLinuxOptions?.type),
  );

  return {
    violations: containerViolations,
    isPodViolation: false,
  };
}

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
    markExemption(Policy.DropAllCapabilities)(request);
    if (request.HasAnnotation(`${exemptionAnnotationPrefix}.${Policy.DropAllCapabilities}`)) {
      return;
    }

    setAllContainersDropAllCapabilities(containers(request));
    annotateMutation(request, Policy.DropAllCapabilities);
  })
  .Validate(request => {
    if (isExempt(request, Policy.DropAllCapabilities)) {
      return request.Approve();
    }
    const authorized = "ALL";
    const violations = findContainersWithoutDropAllCapability(
      securityContextContainers(request),
      authorized,
    );

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
 * Sets the drop capabilities to ["ALL"] for all containers in the provided list
 */
export function setAllContainersDropAllCapabilities(containers: V1Container[]) {
  // Always set drop: ["ALL"] for all containers
  for (const container of containers) {
    container.securityContext = container.securityContext || {};
    container.securityContext.capabilities = container.securityContext.capabilities || {};
    container.securityContext.capabilities.drop = ["ALL"];
  }
}

/**
 * Finds containers that don't have the specified capability in their drop list
 */
export function findContainersWithoutDropAllCapability(
  containers: Ctx[],
  requiredCapability: string,
) {
  return containers.filter(c => {
    // Match the original behavior: returns true if capabilities?.drop?.includes() is falsy
    return !c.ctx.capabilities?.drop?.includes(requiredCapability);
  });
}

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
  .Mutate(markExemption(Policy.RestrictCapabilities))
  .Validate(request => {
    if (isExempt(request, Policy.RestrictCapabilities)) {
      return request.Approve();
    }

    const authorized = ["NET_BIND_SERVICE"];
    // Check container securityContext, filter out istio-init containers
    const containers = securityContextContainers(request, true);
    const violations = validateContainerCapabilities(containers, authorized);

    if (violations.length > 0) {
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

/**
 * Validates container capabilities against an allowlist
 */
export function validateContainerCapabilities(
  containers: Ctx[],
  allowedCapabilities: string[],
): Ctx[] {
  return containers
    .filter(
      (c): c is Ctx & { ctx: { capabilities: { add: string[] } } } =>
        !!c.ctx?.capabilities?.add?.length,
    )
    .filter(c => !c.ctx.capabilities.add.every(cap => allowedCapabilities.includes(cap)))
    .map(c => ({
      name: c.name || "unnamed",
      ctx: {
        capabilities: {
          add: c.ctx.capabilities.add,
        },
      },
    }));
}
