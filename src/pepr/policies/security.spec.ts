/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { V1Container, V1PodSecurityContext, V1SecurityContext } from "@kubernetes/client-node";
import { a, PeprMutateRequest, PeprValidateRequest } from "pepr";
import { beforeEach, describe, expect, it, Mock, vi } from "vitest";
import { Policy } from "../operator/crd";
import {
  mutateDisallowPrivileged,
  mutateDropAllCapabilities,
  mutateRequireNonRootUser,
  validateDisallowPrivileged,
  validateDisallowSELinuxOptions,
  validateDropAllCapabilities,
  validateRequireNonRootUser,
  validateRestrictCapabilities,
  validateRestrictProcMount,
  validateRestrictSeccomp,
  validateRestrictSELinuxType,
} from "./security";

// Define type for security context violations in tests
type SecurityContextViolation = {
  name: string;
  ctx: Partial<V1SecurityContext | V1PodSecurityContext>;
};

// Extended security context type for testing supplementalGroups in containers
interface ExtendedSecurityContext extends V1SecurityContext {
  supplementalGroups?: number[];
}

// Mock dependencies
vi.mock("./exemptions", async () => {
  const actual = await vi.importActual<typeof import("./exemptions")>("./exemptions");
  return {
    ...actual,
    isExempt: vi.fn((): boolean => false),
    markExemption: vi.fn().mockImplementation(() => {
      return (req: PeprMutateRequest<a.Pod>) => {
        return req;
      };
    }),
  };
});

vi.mock("./common", async () => {
  const actual = await vi.importActual<typeof import("./common")>("./common");
  return {
    ...actual,
    securityContextContainers: vi.fn((): SecurityContextViolation[] => []),
    securityContextMessage: vi.fn((): string => ""),
    containers: vi.fn().mockImplementation(request => {
      return request.Raw.spec?.containers || [];
    }),
    annotateMutation: vi.fn(),
  };
});

// Import mocked modules
import { annotateMutation, securityContextContainers, securityContextMessage } from "./common";
import { isExempt, markExemption } from "./exemptions";

/**
 * Creates a basic Pod request object for validate tests
 */
function createPodRequest(containers: Partial<V1Container>[] = []) {
  const defaultContainer = {
    name: "test-container",
    securityContext: {},
  };

  return {
    Approve: vi.fn().mockReturnValue("approved"),
    Deny: vi.fn().mockReturnValue("denied"),
    Raw: {
      metadata: { name: "test-pod" },
      spec: {
        containers: containers.length > 0 ? containers : [defaultContainer],
      },
    },
  } as unknown as PeprValidateRequest<a.Pod>;
}

/**
 * Creates a basic Pod request object for mutation tests
 */
function createMutationRequest(containers: Partial<V1Container>[] = []) {
  const defaultContainer = {
    name: "test-container",
    securityContext: {},
  };

  return {
    HasAnnotation: vi.fn().mockReturnValue(false),
    Raw: {
      metadata: {
        name: "test-pod",
        annotations: {},
      },
      spec: {
        containers: containers.length > 0 ? containers : [defaultContainer],
      },
    },
  } as unknown as PeprMutateRequest<a.Pod>;
}

describe("validateRestrictCapabilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (isExempt as Mock).mockReturnValue(false);
  });

  it("should approve request when pod is exempt from the policy", () => {
    // Mock isExempt to return true
    (isExempt as Mock).mockReturnValue(true);

    // Create a pod with unauthorized capability
    const mockRequest = createPodRequest([
      {
        name: "test-container",
        securityContext: {
          capabilities: {
            add: ["SYS_ADMIN"], // Unauthorized capability
          },
        },
      },
    ]);

    const result = validateRestrictCapabilities(mockRequest);

    // Verify approval when exempt
    expect(isExempt).toHaveBeenCalledWith(mockRequest, Policy.RestrictCapabilities);
    expect(mockRequest.Approve).toHaveBeenCalled();
    expect(result).toBe("approved");
  });

  it("should approve request when containers have authorized capabilities", () => {
    // Setup container with authorized capabilities only
    (securityContextContainers as Mock).mockReturnValue([]);

    const mockRequest = createPodRequest([
      {
        name: "test-container",
        securityContext: {
          capabilities: {
            add: ["NET_BIND_SERVICE"], // Authorized capability
          },
        },
      },
    ]);

    const result = validateRestrictCapabilities(mockRequest);

    // Verify request was approved
    expect(mockRequest.Approve).toHaveBeenCalled();
    expect(result).toBe("approved");
  });

  it("should deny request when containers have unauthorized capabilities", () => {
    // Setup container with unauthorized capabilities
    const mockViolations = [
      {
        name: "test-container",
        ctx: {
          capabilities: {
            add: ["SYS_ADMIN"], // Unauthorized capability
          },
        },
      },
    ];

    (securityContextContainers as Mock).mockReturnValue(mockViolations);
    (securityContextMessage as Mock).mockReturnValue("Unauthorized capabilities message");

    const mockRequest = createPodRequest([
      {
        name: "test-container",
        securityContext: {
          capabilities: {
            add: ["SYS_ADMIN"], // Unauthorized capability
          },
        },
      },
    ]);

    const result = validateRestrictCapabilities(mockRequest);

    // Verify key behaviors
    expect(securityContextContainers).toHaveBeenCalledWith(mockRequest, true);
    expect(mockRequest.Deny).toHaveBeenCalled();
    expect(result).toBe("denied");
  });
});

describe("validateDropAllCapabilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (isExempt as Mock).mockReturnValue(false);
  });

  it("should approve request when pod is exempt from the policy", () => {
    // Mock isExempt to return true
    (isExempt as Mock).mockReturnValue(true);

    const mockRequest = createPodRequest([
      {
        name: "test-container",
        securityContext: {
          capabilities: {
            drop: [], // Missing required ALL
          },
        },
      },
    ]);

    const result = validateDropAllCapabilities(mockRequest);

    // Verify approval when exempt
    expect(isExempt).toHaveBeenCalledWith(mockRequest, Policy.DropAllCapabilities);
    expect(mockRequest.Approve).toHaveBeenCalled();
    expect(result).toBe("approved");
  });

  it("should deny request when containers don't have ALL in drop capabilities", () => {
    // Setup container with missing ALL in drop capabilities
    const mockViolations = [
      {
        name: "test-container",
        ctx: {
          capabilities: {
            drop: ["NET_RAW"], // Missing ALL
          },
        },
      },
    ];

    (securityContextContainers as Mock).mockReturnValue(mockViolations);
    (securityContextMessage as Mock).mockReturnValue("Unauthorized drop capabilities message");

    const mockRequest = createPodRequest([
      {
        name: "test-container",
        securityContext: {
          capabilities: {
            drop: ["NET_RAW"], // Missing ALL
          },
        },
      },
    ]);

    const result = validateDropAllCapabilities(mockRequest);

    // Verify key behaviors
    expect(mockRequest.Deny).toHaveBeenCalledWith("Unauthorized drop capabilities message");
    expect(result).toBe("denied");
  });
});

describe("mutateDropAllCapabilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should not modify containers when pod is exempt", () => {
    // Setup request with exemption annotation
    const mockRequest = createMutationRequest([
      {
        name: "test-container",
        securityContext: {
          capabilities: {},
        },
      },
    ]);

    (mockRequest.HasAnnotation as Mock).mockReturnValue(true);

    // Call the mutation function
    mutateDropAllCapabilities(mockRequest);

    // Verify markExemption was called
    expect(markExemption).toHaveBeenCalledWith(Policy.DropAllCapabilities);

    // Verify container was not modified
    expect(
      mockRequest.Raw.spec?.containers?.[0]?.securityContext?.capabilities?.drop,
    ).toBeUndefined();
    expect(annotateMutation).not.toHaveBeenCalled();
  });

  it("should add drop: ['ALL'] to all containers", () => {
    // Setup containers without drop capability
    const mockRequest = createMutationRequest([
      {
        name: "test-container-1",
        securityContext: {},
      },
      {
        name: "test-container-2",
        securityContext: {
          capabilities: {},
        },
      },
    ]);

    // Call the mutation function
    mutateDropAllCapabilities(mockRequest);

    // Verify both containers now have drop: ["ALL"]
    expect(mockRequest.Raw.spec?.containers?.[0]?.securityContext?.capabilities?.drop).toEqual([
      "ALL",
    ]);
    expect(mockRequest.Raw.spec?.containers?.[1]?.securityContext?.capabilities?.drop).toEqual([
      "ALL",
    ]);

    // Verify mutation was annotated
    expect(annotateMutation).toHaveBeenCalledWith(mockRequest, Policy.DropAllCapabilities);
  });
});

describe("validateRestrictSELinuxType", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (isExempt as Mock).mockReturnValue(false);
  });

  it("should approve request when pod is exempt from the policy", () => {
    // Mock isExempt to return true
    (isExempt as Mock).mockReturnValue(true);

    // Create a pod with unauthorized SELinux type
    const mockRequest = createPodRequest([]);
    if (mockRequest.Raw.spec) {
      mockRequest.Raw.spec.securityContext = {
        seLinuxOptions: {
          type: "unauthorized_type",
        },
      };
    }

    const result = validateRestrictSELinuxType(mockRequest);

    // Verify approval when exempt
    expect(isExempt).toHaveBeenCalledWith(mockRequest, Policy.RestrictSELinuxType);
    expect(mockRequest.Approve).toHaveBeenCalled();
    expect(result).toBe("approved");
  });

  it("should approve request when pod has authorized SELinux type", () => {
    // Create a pod with authorized SELinux type
    const mockRequest = createPodRequest([]);
    if (mockRequest.Raw.spec) {
      mockRequest.Raw.spec.securityContext = {
        seLinuxOptions: {
          type: "container_t",
        },
      };
    }

    const result = validateRestrictSELinuxType(mockRequest);

    // Verify request was approved
    expect(mockRequest.Approve).toHaveBeenCalled();
    expect(result).toBe("approved");
  });

  it("should deny request when pod has unauthorized SELinux type", () => {
    // Create a pod with unauthorized SELinux type
    const mockRequest = createPodRequest([]);
    if (mockRequest.Raw.spec) {
      mockRequest.Raw.spec.securityContext = {
        seLinuxOptions: {
          type: "unauthorized_type",
        },
      };
    }

    // Mock securityContextContainers to return violations
    (securityContextContainers as Mock).mockReturnValue([]);
    (securityContextMessage as Mock).mockReturnValue("Unauthorized SELinux type message");

    const result = validateRestrictSELinuxType(mockRequest);

    // Verify request was denied
    expect(mockRequest.Deny).toHaveBeenCalledWith("Unauthorized SELinux type message");
    expect(result).toBe("denied");
  });

  it("should deny request when container has unauthorized SELinux type", () => {
    // Setup container with unauthorized SELinux type
    const mockViolations = [
      {
        name: "test-container",
        ctx: {
          seLinuxOptions: {
            type: "unauthorized_type",
          },
        },
      },
    ];

    // Mock securityContextContainers to return violations
    (securityContextContainers as Mock).mockReturnValue(mockViolations);
    (securityContextMessage as Mock).mockReturnValue("Unauthorized SELinux type message");

    const mockRequest = createPodRequest([
      {
        name: "test-container",
        securityContext: {
          seLinuxOptions: {
            type: "unauthorized_type",
          },
        },
      },
    ]);

    const result = validateRestrictSELinuxType(mockRequest);

    // Verify request was denied
    expect(mockRequest.Deny).toHaveBeenCalledWith("Unauthorized SELinux type message");
    expect(result).toBe("denied");
  });
});

describe("validateDisallowSELinuxOptions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (isExempt as Mock).mockReturnValue(false);
  });

  it("should approve request when pod is exempt from the policy", () => {
    // Mock isExempt to return true
    (isExempt as Mock).mockReturnValue(true);

    // Create a pod with unauthorized SELinux options (user set)
    const mockRequest = createPodRequest([]);
    if (mockRequest.Raw.spec) {
      mockRequest.Raw.spec.securityContext = {
        seLinuxOptions: {
          user: "root", // Unauthorized option
        },
      };
    }

    const result = validateDisallowSELinuxOptions(mockRequest);

    // Verify approval when exempt
    expect(isExempt).toHaveBeenCalledWith(mockRequest, Policy.DisallowSELinuxOptions);
    expect(mockRequest.Approve).toHaveBeenCalled();
    expect(result).toBe("approved");
  });

  it("should approve request when pod has no user/role SELinux options", () => {
    // Create a pod with only type set (allowed)
    const mockRequest = createPodRequest([]);
    if (mockRequest.Raw.spec) {
      mockRequest.Raw.spec.securityContext = {
        seLinuxOptions: {
          type: "container_t", // Only type is set, no user/role
        },
      };
    }

    const result = validateDisallowSELinuxOptions(mockRequest);

    // Verify request was approved
    expect(mockRequest.Approve).toHaveBeenCalled();
    expect(result).toBe("approved");
  });

  it("should deny request when pod has user SELinux option", () => {
    // Create a pod with unauthorized SELinux option (user)
    const mockRequest = createPodRequest([]);
    if (mockRequest.Raw.spec) {
      mockRequest.Raw.spec.securityContext = {
        seLinuxOptions: {
          user: "root", // Unauthorized option
        },
      };
    }

    // Mock securityContextContainers to return violations
    (securityContextContainers as Mock).mockReturnValue([]);
    (securityContextMessage as Mock).mockReturnValue("Unauthorized SELinux Options message");

    const result = validateDisallowSELinuxOptions(mockRequest);

    // Verify request was denied
    expect(mockRequest.Deny).toHaveBeenCalledWith("Unauthorized SELinux Options message");
    expect(result).toBe("denied");
  });

  it("should deny request when pod has role SELinux option", () => {
    // Create a pod with unauthorized SELinux option (role)
    const mockRequest = createPodRequest([]);
    if (mockRequest.Raw.spec) {
      mockRequest.Raw.spec.securityContext = {
        seLinuxOptions: {
          role: "sysadm_r", // Unauthorized option
        },
      };
    }

    // Mock securityContextContainers to return violations
    (securityContextContainers as Mock).mockReturnValue([]);
    (securityContextMessage as Mock).mockReturnValue("Unauthorized SELinux Options message");

    const result = validateDisallowSELinuxOptions(mockRequest);

    // Verify request was denied
    expect(mockRequest.Deny).toHaveBeenCalledWith("Unauthorized SELinux Options message");
    expect(result).toBe("denied");
  });

  it("should deny request when container has user SELinux option", () => {
    // Setup container with unauthorized SELinux option
    const mockViolations = [
      {
        name: "test-container",
        ctx: {
          seLinuxOptions: {
            user: "root", // Unauthorized option
          },
        },
      },
    ];

    // Mock securityContextContainers to return violations
    (securityContextContainers as Mock).mockReturnValue(mockViolations);
    (securityContextMessage as Mock).mockReturnValue("Unauthorized SELinux Options message");

    const mockRequest = createPodRequest([
      {
        name: "test-container",
        securityContext: {
          seLinuxOptions: {
            user: "root", // Unauthorized option
          },
        },
      },
    ]);

    const result = validateDisallowSELinuxOptions(mockRequest);

    // Verify request was denied
    expect(mockRequest.Deny).toHaveBeenCalledWith("Unauthorized SELinux Options message");
    expect(result).toBe("denied");
  });
});

describe("validateRestrictSeccomp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (isExempt as Mock).mockReturnValue(false);
  });

  it("should approve request when pod is exempt from the policy", () => {
    // Mock isExempt to return true
    (isExempt as Mock).mockReturnValue(true);

    // Create a pod with unauthorized seccomp profile
    const mockRequest = createPodRequest([]);
    if (mockRequest.Raw.spec) {
      mockRequest.Raw.spec.securityContext = {
        seccompProfile: {
          type: "Unconfined", // Unauthorized profile type
        },
      };
    }

    const result = validateRestrictSeccomp(mockRequest);

    // Verify approval when exempt
    expect(isExempt).toHaveBeenCalledWith(mockRequest, Policy.RestrictSeccomp);
    expect(mockRequest.Approve).toHaveBeenCalled();
    expect(result).toBe("approved");
  });

  it("should approve request when pod has authorized seccomp profile type (RuntimeDefault)", () => {
    // Create a pod with authorized seccomp profile
    const mockRequest = createPodRequest([]);
    if (mockRequest.Raw.spec) {
      mockRequest.Raw.spec.securityContext = {
        seccompProfile: {
          type: "RuntimeDefault", // Authorized profile type
        },
      };
    }

    const result = validateRestrictSeccomp(mockRequest);

    // Verify request was approved
    expect(mockRequest.Approve).toHaveBeenCalled();
    expect(result).toBe("approved");
  });

  it("should approve request when pod has authorized seccomp profile type (Localhost)", () => {
    // Create a pod with authorized seccomp profile
    const mockRequest = createPodRequest([]);
    if (mockRequest.Raw.spec) {
      mockRequest.Raw.spec.securityContext = {
        seccompProfile: {
          type: "Localhost", // Authorized profile type
        },
      };
    }

    const result = validateRestrictSeccomp(mockRequest);

    // Verify request was approved
    expect(mockRequest.Approve).toHaveBeenCalled();
    expect(result).toBe("approved");
  });

  it("should deny request when pod has unauthorized seccomp profile type", () => {
    // Create a pod with unauthorized seccomp profile
    const mockRequest = createPodRequest([]);
    if (mockRequest.Raw.spec) {
      mockRequest.Raw.spec.securityContext = {
        seccompProfile: {
          type: "Unconfined", // Unauthorized profile type
        },
      };
    }

    // Mock securityContextContainers to return violations
    (securityContextContainers as Mock).mockReturnValue([]);
    (securityContextMessage as Mock).mockReturnValue("Unauthorized pod seccomp profile type");

    const result = validateRestrictSeccomp(mockRequest);

    // Verify request was denied
    expect(mockRequest.Deny).toHaveBeenCalledWith("Unauthorized pod seccomp profile type");
    expect(result).toBe("denied");
  });

  it("should deny request when container has unauthorized seccomp profile type", () => {
    // Setup container with unauthorized seccomp profile
    const mockViolations = [
      {
        name: "test-container",
        ctx: {
          seccompProfile: {
            type: "Unconfined", // Unauthorized profile type
          },
        },
      },
    ];

    // Mock securityContextContainers to return violations
    (securityContextContainers as Mock).mockReturnValue(mockViolations);
    (securityContextMessage as Mock).mockReturnValue("Unauthorized container seccomp profile type");

    const mockRequest = createPodRequest([
      {
        name: "test-container",
        securityContext: {
          seccompProfile: {
            type: "Unconfined", // Unauthorized profile type
          },
        },
      },
    ]);

    const result = validateRestrictSeccomp(mockRequest);

    // Verify request was denied
    expect(mockRequest.Deny).toHaveBeenCalledWith("Unauthorized container seccomp profile type");
    expect(result).toBe("denied");
  });
});

describe("validateRestrictProcMount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (isExempt as Mock).mockReturnValue(false);
  });

  it("should approve request when pod is exempt from the policy", () => {
    // Mock isExempt to return true
    (isExempt as Mock).mockReturnValue(true);

    // Create a pod with container having unauthorized procMount
    const mockRequest = createPodRequest([
      {
        name: "test-container",
        securityContext: {
          procMount: "Unmasked", // Unauthorized procMount type
        },
      },
    ]);

    const result = validateRestrictProcMount(mockRequest);

    // Verify approval when exempt
    expect(isExempt).toHaveBeenCalledWith(mockRequest, Policy.RestrictProcMount);
    expect(mockRequest.Approve).toHaveBeenCalled();
    expect(result).toBe("approved");
  });

  it("should approve request when container has authorized procMount type (Default)", () => {
    // Create a pod with container having authorized procMount
    const mockRequest = createPodRequest([
      {
        name: "test-container",
        securityContext: {
          procMount: "Default", // Authorized procMount type
        },
      },
    ]);

    // Mock securityContextContainers to return no violations
    (securityContextContainers as Mock).mockReturnValue([]);

    const result = validateRestrictProcMount(mockRequest);

    // Verify request was approved
    expect(mockRequest.Approve).toHaveBeenCalled();
    expect(result).toBe("approved");
  });

  it("should approve request when container has authorized procMount type (undefined)", () => {
    // Create a pod with container having no procMount specified
    const mockRequest = createPodRequest([
      {
        name: "test-container",
        securityContext: {}, // procMount is undefined
      },
    ]);

    // Mock securityContextContainers to return no violations
    (securityContextContainers as Mock).mockReturnValue([]);

    const result = validateRestrictProcMount(mockRequest);

    // Verify request was approved
    expect(mockRequest.Approve).toHaveBeenCalled();
    expect(result).toBe("approved");
  });

  it("should deny request when container has unauthorized procMount type", () => {
    // Setup container with unauthorized procMount
    const mockViolations = [
      {
        name: "test-container",
        ctx: {
          procMount: "Unmasked", // Unauthorized procMount type
        },
      },
    ];

    // Mock securityContextContainers to return violations
    (securityContextContainers as Mock).mockReturnValue(mockViolations);
    (securityContextMessage as Mock).mockReturnValue("Unauthorized procMount type");

    const mockRequest = createPodRequest([
      {
        name: "test-container",
        securityContext: {
          procMount: "Unmasked", // Unauthorized procMount type
        },
      },
    ]);

    const result = validateRestrictProcMount(mockRequest);

    // Verify request was denied
    expect(mockRequest.Deny).toHaveBeenCalledWith("Unauthorized procMount type");
    expect(result).toBe("denied");
  });
});

describe("mutateRequireNonRootUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should not modify pod when it is exempt", () => {
    // Setup request with exemption annotation
    const mockRequest = createMutationRequest([]);

    // Mock HasAnnotation to return true
    (mockRequest.HasAnnotation as Mock).mockReturnValue(true);

    // Call the mutation function
    mutateRequireNonRootUser(mockRequest);

    // Verify markExemption was called
    expect(markExemption).toHaveBeenCalledWith(Policy.RequireNonRootUser);

    // Verify pod was not modified
    expect(annotateMutation).not.toHaveBeenCalled();
  });

  it("should set default non-root settings when no securityContext is present", () => {
    // Setup request with no securityContext
    const mockRequest = createMutationRequest([]);

    // Call the mutation function
    mutateRequireNonRootUser(mockRequest);

    // Verify securityContext was set with default values
    expect(mockRequest.Raw.spec?.securityContext?.runAsNonRoot).toBe(true);
    expect(mockRequest.Raw.spec?.securityContext?.runAsUser).toBe(1000);
    expect(mockRequest.Raw.spec?.securityContext?.runAsGroup).toBe(1000);

    // Verify mutation was annotated
    expect(annotateMutation).toHaveBeenCalledWith(mockRequest, Policy.RequireNonRootUser);
  });

  it("should use user/group/fsGroup values from labels", () => {
    // Setup request with labels
    const mockRequest = createMutationRequest([]);
    if (mockRequest.Raw.metadata) {
      mockRequest.Raw.metadata.labels = {
        "uds/user": "2000",
        "uds/group": "3000",
        "uds/fsgroup": "4000",
      };
    }

    // Call the mutation function
    mutateRequireNonRootUser(mockRequest);

    // Verify securityContext was set with values from labels
    expect(mockRequest.Raw.spec?.securityContext?.runAsUser).toBe(2000);
    expect(mockRequest.Raw.spec?.securityContext?.runAsGroup).toBe(3000);
    expect(mockRequest.Raw.spec?.securityContext?.fsGroup).toBe(4000);
    expect(mockRequest.Raw.spec?.securityContext?.runAsNonRoot).toBe(true);

    // Verify mutation was annotated
    expect(annotateMutation).toHaveBeenCalledWith(mockRequest, Policy.RequireNonRootUser);
  });

  it("should preserve existing securityContext values", () => {
    // Setup request with existing securityContext
    const mockRequest = createMutationRequest([]);
    if (mockRequest.Raw.spec) {
      mockRequest.Raw.spec.securityContext = {
        runAsNonRoot: false,
        runAsUser: 500,
        runAsGroup: 500,
      };
    }

    // Call the mutation function
    mutateRequireNonRootUser(mockRequest);

    // Verify existing values were preserved
    expect(mockRequest.Raw.spec?.securityContext?.runAsNonRoot).toBe(false);
    expect(mockRequest.Raw.spec?.securityContext?.runAsUser).toBe(500);
    expect(mockRequest.Raw.spec?.securityContext?.runAsGroup).toBe(500);

    // Verify mutation was annotated
    expect(annotateMutation).toHaveBeenCalledWith(mockRequest, Policy.RequireNonRootUser);
  });
});

describe("mutateDisallowPrivileged", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should not modify containers when pod is exempt", () => {
    // Setup request with exemption annotation
    const mockRequest = createMutationRequest([
      {
        name: "test-container",
        securityContext: {
          // allowPrivilegeEscalation is undefined
        },
      },
    ]);

    (mockRequest.HasAnnotation as Mock).mockReturnValue(true);

    // Call the mutation function
    mutateDisallowPrivileged(mockRequest);

    // Verify markExemption was called
    expect(markExemption).toHaveBeenCalledWith(Policy.DisallowPrivileged);

    // Verify container was not modified
    expect(
      mockRequest.Raw.spec?.containers?.[0]?.securityContext?.allowPrivilegeEscalation,
    ).toBeUndefined();
    expect(annotateMutation).not.toHaveBeenCalled();
  });

  it("should set allowPrivilegeEscalation to false when not defined and not privileged", () => {
    // Setup containers without allowPrivilegeEscalation
    const mockRequest = createMutationRequest([
      {
        name: "test-container-1",
        securityContext: {}, // No privilege settings
      },
      {
        name: "test-container-2",
        securityContext: {
          privileged: false, // Explicitly not privileged
        },
      },
    ]);

    // Call the mutation function
    mutateDisallowPrivileged(mockRequest);

    // Verify containers now have allowPrivilegeEscalation: false
    expect(mockRequest.Raw.spec?.containers?.[0]?.securityContext?.allowPrivilegeEscalation).toBe(
      false,
    );
    expect(mockRequest.Raw.spec?.containers?.[1]?.securityContext?.allowPrivilegeEscalation).toBe(
      false,
    );

    // Verify mutation was annotated
    expect(annotateMutation).toHaveBeenCalledWith(mockRequest, Policy.DisallowPrivileged);
  });

  it("should not modify allowPrivilegeEscalation when already defined", () => {
    // Setup container with allowPrivilegeEscalation already defined
    const mockRequest = createMutationRequest([
      {
        name: "test-container",
        securityContext: {
          allowPrivilegeEscalation: true, // Already defined
        },
      },
    ]);

    // Call the mutation function
    mutateDisallowPrivileged(mockRequest);

    // Verify container settings were not changed
    expect(mockRequest.Raw.spec?.containers?.[0]?.securityContext?.allowPrivilegeEscalation).toBe(
      true,
    );
    expect(annotateMutation).not.toHaveBeenCalled();
  });

  it("should not modify allowPrivilegeEscalation when container is privileged", () => {
    // Setup container that is privileged
    const mockRequest = createMutationRequest([
      {
        name: "test-container",
        securityContext: {
          privileged: true, // Container is privileged
        },
      },
    ]);

    // Call the mutation function
    mutateDisallowPrivileged(mockRequest);

    // Verify container settings were not changed
    expect(
      mockRequest.Raw.spec?.containers?.[0]?.securityContext?.allowPrivilegeEscalation,
    ).toBeUndefined();
    expect(annotateMutation).not.toHaveBeenCalled();
  });

  it("should not modify allowPrivilegeEscalation when container has CAP_SYS_ADMIN capability", () => {
    // Setup container with CAP_SYS_ADMIN capability
    const mockRequest = createMutationRequest([
      {
        name: "test-container",
        securityContext: {
          capabilities: {
            add: ["CAP_SYS_ADMIN"], // Has admin capability
          },
        },
      },
    ]);

    // Call the mutation function
    mutateDisallowPrivileged(mockRequest);

    // Verify container settings were not changed
    expect(
      mockRequest.Raw.spec?.containers?.[0]?.securityContext?.allowPrivilegeEscalation,
    ).toBeUndefined();
    expect(annotateMutation).not.toHaveBeenCalled();
  });
});

describe("validateDisallowPrivileged", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (isExempt as Mock).mockReturnValue(false);
  });

  it("should approve request when pod is exempt from the policy", () => {
    // Mock isExempt to return true
    (isExempt as Mock).mockReturnValue(true);

    // Create a pod with privilege escalation enabled
    const mockRequest = createPodRequest([
      {
        name: "test-container",
        securityContext: {
          allowPrivilegeEscalation: true, // This would normally be denied
        },
      },
    ]);

    const result = validateDisallowPrivileged(mockRequest);

    // Verify approval when exempt
    expect(isExempt).toHaveBeenCalledWith(mockRequest, Policy.DisallowPrivileged);
    expect(mockRequest.Approve).toHaveBeenCalled();
    expect(result).toBe("approved");
  });

  it("should approve request when containers have privilege escalation disabled", () => {
    // Setup container with privilege escalation disabled
    (securityContextContainers as Mock).mockReturnValue([]);

    const mockRequest = createPodRequest([
      {
        name: "test-container",
        securityContext: {
          allowPrivilegeEscalation: false, // Properly configured
          privileged: false,
        },
      },
    ]);

    const result = validateDisallowPrivileged(mockRequest);

    // Verify request was approved
    expect(mockRequest.Approve).toHaveBeenCalled();
    expect(result).toBe("approved");
  });

  it("should deny request when allowPrivilegeEscalation is true", () => {
    // Setup container with privilege escalation enabled
    const mockViolations = [
      {
        name: "test-container",
        ctx: {
          allowPrivilegeEscalation: true, // Not allowed
        },
      },
    ];

    // Mock securityContextContainers to return violations
    (securityContextContainers as Mock).mockReturnValue(mockViolations);
    (securityContextMessage as Mock).mockReturnValue("Privilege escalation is disallowed");

    const mockRequest = createPodRequest([
      {
        name: "test-container",
        securityContext: {
          allowPrivilegeEscalation: true, // Not allowed
        },
      },
    ]);

    const result = validateDisallowPrivileged(mockRequest);

    // Verify request was denied
    expect(mockRequest.Deny).toHaveBeenCalledWith("Privilege escalation is disallowed");
    expect(result).toBe("denied");
  });

  it("should deny request when container is privileged", () => {
    // Setup container with privileged mode
    const mockViolations = [
      {
        name: "test-container",
        ctx: {
          privileged: true, // Not allowed
        },
      },
    ];

    // Mock securityContextContainers to return violations
    (securityContextContainers as Mock).mockReturnValue(mockViolations);
    (securityContextMessage as Mock).mockReturnValue("Privilege escalation is disallowed");

    const mockRequest = createPodRequest([
      {
        name: "test-container",
        securityContext: {
          privileged: true, // Not allowed
        },
      },
    ]);

    const result = validateDisallowPrivileged(mockRequest);

    // Verify request was denied
    expect(mockRequest.Deny).toHaveBeenCalledWith("Privilege escalation is disallowed");
    expect(result).toBe("denied");
  });

  it("should deny request when container has undefined allowPrivilegeEscalation (defaults to true)", () => {
    // Setup container with undefined allowPrivilegeEscalation (which defaults to true)
    const mockViolations = [
      {
        name: "test-container",
        ctx: {
          // allowPrivilegeEscalation is undefined, which defaults to true in K8s
        },
      },
    ];

    // Mock securityContextContainers to return violations
    (securityContextContainers as Mock).mockReturnValue(mockViolations);
    (securityContextMessage as Mock).mockReturnValue("Privilege escalation is disallowed");

    const mockRequest = createPodRequest([
      {
        name: "test-container",
        securityContext: {}, // No explicit setting
      },
    ]);

    const result = validateDisallowPrivileged(mockRequest);

    // Verify request was denied
    expect(mockRequest.Deny).toHaveBeenCalledWith("Privilege escalation is disallowed");
    expect(result).toBe("denied");
  });
});

describe("validateRequireNonRootUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (isExempt as Mock).mockReturnValue(false);
  });

  it("should approve request when pod is exempt from the policy", () => {
    // Mock isExempt to return true
    (isExempt as Mock).mockReturnValue(true);

    // Create a pod with root user settings
    const mockRequest = createPodRequest([]);
    if (mockRequest.Raw.spec) {
      mockRequest.Raw.spec.securityContext = {
        runAsNonRoot: false, // Not meeting non-root requirement
      };
    }

    const result = validateRequireNonRootUser(mockRequest);

    // Verify approval when exempt
    expect(isExempt).toHaveBeenCalledWith(mockRequest, Policy.RequireNonRootUser);
    expect(mockRequest.Approve).toHaveBeenCalled();
    expect(result).toBe("approved");
  });

  it("should approve request when pod and containers meet non-root requirements", () => {
    // Create a pod with proper non-root settings
    const mockRequest = createPodRequest([
      {
        name: "test-container",
        securityContext: {
          runAsNonRoot: true,
          runAsUser: 1000,
        },
      },
    ]);
    if (mockRequest.Raw.spec) {
      mockRequest.Raw.spec.securityContext = {
        runAsNonRoot: true,
        runAsUser: 1000,
      };
    }

    // Mock securityContextContainers to return no violations
    (securityContextContainers as Mock).mockReturnValue([]);

    const result = validateRequireNonRootUser(mockRequest);

    // Verify request was approved
    expect(mockRequest.Approve).toHaveBeenCalled();
    expect(result).toBe("approved");
  });

  it("should deny request when pod securityContext has runAsNonRoot=false", () => {
    // Create a pod with runAsNonRoot=false
    const mockRequest = createPodRequest([]);
    if (mockRequest.Raw.spec) {
      mockRequest.Raw.spec.securityContext = {
        runAsNonRoot: false, // Not meeting non-root requirement
      };
    }

    // Mock securityContextMessage
    (securityContextMessage as Mock).mockReturnValue(
      "Pod level securityContext does not meet the non-root user requirement.",
    );

    const result = validateRequireNonRootUser(mockRequest);

    // Verify request was denied
    expect(mockRequest.Deny).toHaveBeenCalledWith(
      "Pod level securityContext does not meet the non-root user requirement.",
    );
    expect(result).toBe("denied");
  });

  it("should deny request when pod securityContext has runAsUser=0", () => {
    // Create a pod with runAsUser=0 (root)
    const mockRequest = createPodRequest([]);
    if (mockRequest.Raw.spec) {
      mockRequest.Raw.spec.securityContext = {
        runAsUser: 0, // Root user
      };
    }

    // Mock securityContextMessage
    (securityContextMessage as Mock).mockReturnValue(
      "Pod level securityContext does not meet the non-root user requirement.",
    );

    const result = validateRequireNonRootUser(mockRequest);

    // Verify request was denied
    expect(mockRequest.Deny).toHaveBeenCalledWith(
      "Pod level securityContext does not meet the non-root user requirement.",
    );
    expect(result).toBe("denied");
  });

  it("should deny request when pod securityContext has supplementalGroups with 0", () => {
    // Create a pod with supplementalGroups including 0 (root)
    const mockRequest = createPodRequest([]);
    if (mockRequest.Raw.spec) {
      mockRequest.Raw.spec.securityContext = {
        supplementalGroups: [1000, 0, 2000], // Includes root group
      };
    }

    // Mock securityContextMessage
    (securityContextMessage as Mock).mockReturnValue(
      "Pod level securityContext does not meet the non-root user requirement.",
    );

    const result = validateRequireNonRootUser(mockRequest);

    // Verify request was denied
    expect(mockRequest.Deny).toHaveBeenCalledWith(
      "Pod level securityContext does not meet the non-root user requirement.",
    );
    expect(result).toBe("denied");
  });

  it("should deny request when container securityContext has runAsNonRoot=false", () => {
    // Setup container with runAsNonRoot=false
    const mockViolations = [
      {
        name: "test-container",
        ctx: {
          runAsNonRoot: false, // Not meeting non-root requirement
        },
      },
    ];

    // Mock securityContextContainers to return violations
    (securityContextContainers as Mock).mockReturnValue(mockViolations);
    (securityContextMessage as Mock).mockReturnValue(
      "Unauthorized container securityContext. Containers must not run as root or have root-level supplemental groups",
    );

    const mockRequest = createPodRequest([
      {
        name: "test-container",
        securityContext: {
          runAsNonRoot: false, // Not meeting non-root requirement
        },
      },
    ]);

    const result = validateRequireNonRootUser(mockRequest);

    // Verify request was denied
    expect(mockRequest.Deny).toHaveBeenCalledWith(
      "Unauthorized container securityContext. Containers must not run as root or have root-level supplemental groups",
    );
    expect(result).toBe("denied");
  });

  it("should deny request when container securityContext has runAsUser=0", () => {
    // Setup container with runAsUser=0 (root)
    const mockViolations = [
      {
        name: "test-container",
        ctx: {
          runAsUser: 0, // Root user
        },
      },
    ];

    // Mock securityContextContainers to return violations
    (securityContextContainers as Mock).mockReturnValue(mockViolations);
    (securityContextMessage as Mock).mockReturnValue(
      "Unauthorized container securityContext. Containers must not run as root or have root-level supplemental groups",
    );

    const mockRequest = createPodRequest([
      {
        name: "test-container",
        securityContext: {
          runAsUser: 0, // Root user
        },
      },
    ]);

    const result = validateRequireNonRootUser(mockRequest);

    // Verify request was denied
    expect(mockRequest.Deny).toHaveBeenCalledWith(
      "Unauthorized container securityContext. Containers must not run as root or have root-level supplemental groups",
    );
    expect(result).toBe("denied");
  });

  it("should deny request when container securityContext has supplementalGroups with 0", () => {
    // Setup container with supplementalGroups including 0 (root)
    const mockViolations = [
      {
        name: "test-container",
        ctx: {
          supplementalGroups: [1000, 0, 2000], // Includes root group
        },
      },
    ];

    // Mock securityContextContainers to return violations
    (securityContextContainers as Mock).mockReturnValue(mockViolations);
    (securityContextMessage as Mock).mockReturnValue(
      "Unauthorized container securityContext. Containers must not run as root or have root-level supplemental groups",
    );

    const mockRequest = createPodRequest([
      {
        name: "test-container",
        // Using ExtendedSecurityContext since supplementalGroups is technically
        // only valid in pod security context, but the tests need to simulate a match
        securityContext: {
          supplementalGroups: [1000, 0, 2000], // Includes root group
        } as ExtendedSecurityContext,
      },
    ]);

    const result = validateRequireNonRootUser(mockRequest);

    // Verify request was denied
    expect(mockRequest.Deny).toHaveBeenCalledWith(
      "Unauthorized container securityContext. Containers must not run as root or have root-level supplemental groups",
    );
    expect(result).toBe("denied");
  });
});
