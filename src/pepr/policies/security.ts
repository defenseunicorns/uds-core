/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { a, PeprMutateRequest, PeprValidateRequest, sdk } from "pepr";

import { V1PodSecurityContext } from "@kubernetes/client-node";
import { Policy } from "../operator/crd";
import {
  annotateMutation,
  Ctx,
  securityContextContainers,
  securityContextMessage,
  When,
} from "./common";
import { exemptionAnnotationPrefix, isExempt, markExemption } from "./exemptions";

/**
 * Create validators with a consistent pattern
 *
 * @param policy The policy to check for exemptions
 * @param podChecker Function to check pod-level violations (return true if there's a violation)
 * @param containerChecker Function to check container-level violations (return true if there's a violation)
 * @param filterIstio Whether to filter out istio-init containers from the validation
 * @param errorConfig Configuration for error messages
 */
function createValidator(
  policy: Policy,
  {
    podChecker,
    containerChecker,
    filterIstio = false,
    podErrorMessage,
    podErrorValues,
    containerErrorMessage,
    containerErrorValues,
  }: {
    podChecker?: (request: PeprValidateRequest<a.Pod>) => boolean;
    containerChecker?: (container: Ctx) => boolean | undefined;
    filterIstio?: boolean;
    podErrorMessage?: string;
    podErrorValues?: (string | undefined)[];
    containerErrorMessage?: string;
    containerErrorValues?: (string | undefined)[];
  },
) {
  return (request: PeprValidateRequest<a.Pod>) => {
    if (isExempt(request, policy)) {
      return request.Approve();
    }

    // Check pod level if applicable
    if (podChecker && podChecker(request)) {
      return request.Deny(
        securityContextMessage(
          podErrorMessage || "Unauthorized pod configuration",
          podErrorValues || [],
          [{ ctx: request.Raw.spec?.securityContext as V1PodSecurityContext }],
        ),
      );
    }

    // Check container level if applicable
    if (containerChecker) {
      // Only pass the filterIstio parameter if it's true, to match original function signatures
      const violations = filterIstio
        ? securityContextContainers(request, filterIstio).filter(containerChecker)
        : securityContextContainers(request).filter(containerChecker);

      if (violations.length) {
        return request.Deny(
          securityContextMessage(
            containerErrorMessage || "Unauthorized container configuration",
            containerErrorValues || [],
            violations,
          ),
        );
      }
    }

    return request.Approve();
  };
}

const { containers } = sdk;

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
    mutateDisallowPrivileged(request);
  })
  .Validate(request => {
    return validateDisallowPrivileged(request);
  });

export function mutateDisallowPrivileged(request: PeprMutateRequest<a.Pod>) {
  // Execute the markExemption function which will set annotation if exempt
  const exemptionMarker = markExemption(Policy.DisallowPrivileged);
  exemptionMarker(request);

  // Return early if has exemption annotation
  if (request.HasAnnotation(`${exemptionAnnotationPrefix}.${Policy.DisallowPrivileged}`)) {
    return;
  }
  let wasMutated = false;

  // Check if any containers defined in the pod do not have the `allowPrivilegeEscalation` field present. If not, include it and set to false.
  for (const container of containers(request)) {
    container.securityContext = container.securityContext || {};
    const mutateCriteria = [
      container.securityContext.allowPrivilegeEscalation === undefined,
      !container.securityContext.privileged,
      !container.securityContext.capabilities?.add?.includes("CAP_SYS_ADMIN"),
    ];
    // We are only mutating if the conditions above are all satisfied
    if (mutateCriteria.every(priv => priv === true)) {
      container.securityContext.allowPrivilegeEscalation = false;
      wasMutated = true;
    }
  }
  if (wasMutated) {
    annotateMutation(request, Policy.DisallowPrivileged);
  }
}

// Define privilege escalation message and expected values as constants
const PRIVILEGE_ESCALATION_ERROR_MESSAGE = "Privilege escalation is disallowed";
const PRIVILEGE_ESCALATION_EXPECTED_VALUES = [
  "allowPrivilegeEscalation = false",
  "privileged = false",
];

export const validateDisallowPrivileged = createValidator(Policy.DisallowPrivileged, {
  // No pod-level check needed for this policy
  podChecker: undefined,
  // Checking if allowPrivilegeEscalation is undefined. If yes, fallback to true as the default behavior in k8s is to allow if undefined.
  // Checks the ways a container could escalate to admin privs
  containerChecker: c => (c.ctx.allowPrivilegeEscalation ?? true) || c.ctx.privileged,
  filterIstio: false,
  containerErrorMessage: PRIVILEGE_ESCALATION_ERROR_MESSAGE,
  containerErrorValues: PRIVILEGE_ESCALATION_EXPECTED_VALUES,
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
    mutateRequireNonRootUser(request);
  })
  .Validate(request => {
    return validateRequireNonRootUser(request);
  });

export function mutateRequireNonRootUser(request: PeprMutateRequest<a.Pod>) {
  // Execute the markExemption function which will set annotation if exempt
  const exemptionMarker = markExemption(Policy.RequireNonRootUser);
  exemptionMarker(request);

  // Return early if has exemption annotation
  if (request.HasAnnotation(`${exemptionAnnotationPrefix}.${Policy.RequireNonRootUser}`)) {
    return;
  }

  const pod = request.Raw.spec!;
  const metadata = request.Raw.metadata || {};

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

  annotateMutation(request, Policy.RequireNonRootUser);
}

// Define nonroot requirement values as constants
const NONROOT_EXPECTED_VALUES = [
  "runAsNonRoot = true",
  "runAsUser > 0",
  "supplementalGroups must not include 0",
];

// Helper function to check if a security context is running as root
const isRoot = (ctx: Partial<V1PodSecurityContext>) => {
  const isRunAsRoot = ctx.runAsNonRoot === false;
  const isRunAsRootUser = ctx.runAsUser === 0;
  const hasRootSupplementalGroups = ctx.supplementalGroups?.includes(0);

  return isRunAsRoot || isRunAsRootUser || hasRootSupplementalGroups;
};

// Check if running as root by checking if runAsNonRoot is false, runAsUser is 0, or has root-level supplemental groups
export const validateRequireNonRootUser = createValidator(Policy.RequireNonRootUser, {
  podChecker: request => {
    // Check pod securityContext
    const podCtx = request.Raw.spec?.securityContext || {};
    return isRoot(podCtx) === true;
  },
  containerChecker: c => isRoot(c.ctx) === true,
  filterIstio: true, // Filter out istio-init containers like in the original function
  podErrorMessage: "Pod level securityContext does not meet the non-root user requirement.",
  podErrorValues: NONROOT_EXPECTED_VALUES,
  containerErrorMessage:
    "Unauthorized container securityContext. Containers must not run as root or have root-level supplemental groups",
  containerErrorValues: NONROOT_EXPECTED_VALUES,
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
  .Mutate(markExemption(Policy.RestrictProcMount))
  .Validate(request => {
    return validateRestrictProcMount(request);
  });

// Define authorized procMount types as a constant
const AUTHORIZED_PROCMOUNT_TYPES = [undefined, "Default"];

export const validateRestrictProcMount = createValidator(Policy.RestrictProcMount, {
  // No pod check needed for this policy
  podChecker: undefined,
  containerChecker: c => !AUTHORIZED_PROCMOUNT_TYPES.includes(c.ctx.procMount),
  filterIstio: false,
  containerErrorMessage: "Unauthorized procMount type",
  containerErrorValues: AUTHORIZED_PROCMOUNT_TYPES,
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
  .Mutate(markExemption(Policy.RestrictSeccomp))
  .Validate(request => {
    return validateRestrictSeccomp(request);
  });

// Define authorized seccomp profile types as a constant
const AUTHORIZED_SECCOMP_TYPES = [undefined, "RuntimeDefault", "Localhost"];

export const validateRestrictSeccomp = createValidator(Policy.RestrictSeccomp, {
  podChecker: request => {
    // Check Pod level security context
    const ctx = request.Raw.spec?.securityContext || {};
    return !AUTHORIZED_SECCOMP_TYPES.includes(ctx.seccompProfile?.type);
  },
  containerChecker: c => !AUTHORIZED_SECCOMP_TYPES.includes(c.ctx.seccompProfile?.type),
  filterIstio: false,
  podErrorMessage: "Unauthorized pod seccomp profile type",
  podErrorValues: AUTHORIZED_SECCOMP_TYPES,
  containerErrorMessage: "Unauthorized container seccomp profile type",
  containerErrorValues: AUTHORIZED_SECCOMP_TYPES,
});

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
    return validateDisallowSELinuxOptions(request);
  });

// Define authorized SELinux options for this policy
const SELINUX_OPTIONS_AUTHORIZED_VALUES = ["user: undefined", "role: undefined"];

export const validateDisallowSELinuxOptions = createValidator(Policy.DisallowSELinuxOptions, {
  // Check Pod level security context
  podChecker: request => {
    const seLinuxOptions = request.Raw.spec?.securityContext?.seLinuxOptions;
    return !!seLinuxOptions?.user || !!seLinuxOptions?.role;
  },
  // Check Container level security context
  containerChecker: c => !!c.ctx.seLinuxOptions?.user || !!c.ctx.seLinuxOptions?.role,
  filterIstio: false,
  podErrorMessage: "Unauthorized pod SELinux Options",
  podErrorValues: SELINUX_OPTIONS_AUTHORIZED_VALUES,
  containerErrorMessage: "Unauthorized container SELinux Options",
  containerErrorValues: SELINUX_OPTIONS_AUTHORIZED_VALUES,
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
  .Mutate(markExemption(Policy.RestrictSELinuxType))
  .Validate(request => {
    return validateRestrictSELinuxType(request);
  });

// Define authorized SELinux types as a constant to avoid repetition
const AUTHORIZED_SELINUX_TYPES = [undefined, "container_t", "container_init_t", "container_kvm_t"];

export const validateRestrictSELinuxType = createValidator(Policy.RestrictSELinuxType, {
  podChecker: request => {
    // Check Pod level security context
    const podSeLinuxType = request.Raw.spec?.securityContext?.seLinuxOptions?.type;
    return !AUTHORIZED_SELINUX_TYPES.includes(podSeLinuxType);
  },
  containerChecker: c => !AUTHORIZED_SELINUX_TYPES.includes(c.ctx.seLinuxOptions?.type),
  filterIstio: false,
  podErrorMessage: "Unauthorized pod SELinux type",
  podErrorValues: AUTHORIZED_SELINUX_TYPES,
  containerErrorMessage: "Unauthorized container SELinux type",
  containerErrorValues: AUTHORIZED_SELINUX_TYPES,
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
    mutateDropAllCapabilities(request);
  })
  .Validate(request => {
    return validateDropAllCapabilities(request);
  });

export function mutateDropAllCapabilities(request: PeprMutateRequest<a.Pod>) {
  // Execute the markExemption function which will set annotation if exempt
  const exemptionMarker = markExemption(Policy.DropAllCapabilities);
  exemptionMarker(request);

  // Return early if has exemption annotation
  if (request.HasAnnotation(`${exemptionAnnotationPrefix}.${Policy.DropAllCapabilities}`)) {
    return;
  }

  // Always set drop: ["ALL"] for all containers
  for (const container of containers(request)) {
    container.securityContext = container.securityContext || {};
    container.securityContext.capabilities = container.securityContext.capabilities || {};
    container.securityContext.capabilities.drop = ["ALL"];
  }
  annotateMutation(request, Policy.DropAllCapabilities);
}

// Define the authorized capabilities drop value as a constant
const AUTHORIZED_CAPABILITY_DROP = "ALL";

export const validateDropAllCapabilities = createValidator(Policy.DropAllCapabilities, {
  // No pod check needed for this policy
  podChecker: undefined,
  containerChecker: c => !c.ctx.capabilities?.drop?.includes(AUTHORIZED_CAPABILITY_DROP),
  filterIstio: false,
  containerErrorMessage:
    "Unauthorized container DROP capabilities in securityContext.capabilities.drop",
  containerErrorValues: [AUTHORIZED_CAPABILITY_DROP],
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
  .Mutate(markExemption(Policy.RestrictCapabilities))
  .Validate(request => {
    return validateRestrictCapabilities(request);
  });

// Define authorized capabilities as a constant
const AUTHORIZED_CAPABILITIES = ["NET_BIND_SERVICE"];

export const validateRestrictCapabilities = createValidator(Policy.RestrictCapabilities, {
  // No pod check needed for this policy
  podChecker: undefined,
  containerChecker: c =>
    c.ctx?.capabilities?.add && !c.ctx?.capabilities.add.includes(AUTHORIZED_CAPABILITIES[0]),
  filterIstio: true, // Filter out istio-init containers
  containerErrorMessage: "Unauthorized container capabilities in securityContext.capabilities.add",
  containerErrorValues: AUTHORIZED_CAPABILITIES,
});
