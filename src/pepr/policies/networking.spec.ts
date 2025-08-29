/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { V1ContainerPort } from "@kubernetes/client-node";
import { PeprValidateRequest, a, sdk } from "pepr";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Policy } from "../operator/crd";
import * as exemptions from "./exemptions";
import {
  validateDisallowHostNamespaces,
  validateDisallowNodePortServices,
  validateRestrictExternalNames,
  validateRestrictHostPorts,
} from "./networking";

// Mock the exemptions module
vi.mock("./exemptions", () => ({
  isExempt: vi.fn(),
  // Mock markExemption as a function that returns a function (higher-order function)
  markExemption: vi.fn().mockImplementation(() => {
    return vi.fn().mockImplementation(request => request);
  }),
}));

// Mock the sdk.containers function
vi.mock("pepr", async importOriginal => {
  const actual = await importOriginal();
  return {
    ...(actual as object),
    sdk: {
      ...((actual as { sdk?: Record<string, unknown> })?.sdk || {}),
      containers: vi.fn(),
    },
  };
});

describe("validateDisallowHostNamespaces", () => {
  // Create a properly typed mock for PeprValidateRequest
  let mockRequest: PeprValidateRequest<a.Pod>;

  beforeEach(() => {
    // Reset mocks between tests
    vi.clearAllMocks();

    // Initialize the mock request with proper typing
    // Use type assertion to bypass the full interface implementation
    // but include the methods we actually use in the tests
    mockRequest = {
      Raw: {
        apiVersion: "v1",
        kind: "Pod",
        metadata: {
          name: "test-pod",
          namespace: "default",
        },
        spec: {
          containers: [
            {
              name: "test-container",
              image: "nginx",
            },
          ],
          hostNetwork: false,
          hostIPC: false,
          hostPID: false,
        },
      },
      Approve: vi.fn().mockReturnValue({
        allowed: true,
        message: "Approved",
      }),
      Deny: vi.fn().mockReturnValue({
        allowed: false,
        message: "Denied",
      }),
      // The following methods are not used in our tests
      HasLabel: vi.fn(),
      HasAnnotation: vi.fn(),
      IsKind: vi.fn(),
    } as unknown as PeprValidateRequest<a.Pod>; // Type assertion for test compatibility
  });

  it("should approve request if pod is exempt from policy", () => {
    // Setup the isExempt mock to return true for this test
    vi.mocked(exemptions.isExempt).mockReturnValue(true);

    // Call the function under test
    validateDisallowHostNamespaces(mockRequest);

    // Verify isExempt was called with correct parameters
    expect(exemptions.isExempt).toHaveBeenCalledWith(mockRequest, Policy.DisallowHostNamespaces);

    // Verify Approve was called and Deny was not
    expect(mockRequest.Approve).toHaveBeenCalled();
    expect(mockRequest.Deny).not.toHaveBeenCalled();
  });

  it("should deny request if pod uses hostNetwork", () => {
    // Setup the isExempt mock to return false for this test
    vi.mocked(exemptions.isExempt).mockReturnValue(false);

    // Set up the pod spec to use hostNetwork
    mockRequest.Raw.spec!.hostNetwork = true;

    // Call the function under test
    validateDisallowHostNamespaces(mockRequest);

    // Verify Deny was called with the correct message and Approve was not called
    expect(mockRequest.Deny).toHaveBeenCalledWith(
      "Sharing the host namespaces is disallowed. The fields spec.hostNetwork, spec.hostIPC, and spec.hostPID must not be set to true.",
    );
    expect(mockRequest.Approve).not.toHaveBeenCalled();
  });

  it("should deny request if pod uses hostIPC", () => {
    // Setup the isExempt mock to return false for this test
    vi.mocked(exemptions.isExempt).mockReturnValue(false);

    // Set up the pod spec to use hostIPC
    mockRequest.Raw.spec!.hostIPC = true;

    // Call the function under test
    validateDisallowHostNamespaces(mockRequest);

    // Verify Deny was called with the correct message
    expect(mockRequest.Deny).toHaveBeenCalledWith(
      "Sharing the host namespaces is disallowed. The fields spec.hostNetwork, spec.hostIPC, and spec.hostPID must not be set to true.",
    );
    expect(mockRequest.Approve).not.toHaveBeenCalled();
  });

  it("should deny request if pod uses hostPID", () => {
    // Setup the isExempt mock to return false for this test
    vi.mocked(exemptions.isExempt).mockReturnValue(false);

    // Set up the pod spec to use hostPID
    mockRequest.Raw.spec!.hostPID = true;

    // Call the function under test
    validateDisallowHostNamespaces(mockRequest);

    // Verify Deny was called with the correct message
    expect(mockRequest.Deny).toHaveBeenCalledWith(
      "Sharing the host namespaces is disallowed. The fields spec.hostNetwork, spec.hostIPC, and spec.hostPID must not be set to true.",
    );
    expect(mockRequest.Approve).not.toHaveBeenCalled();
  });

  it("should approve request if pod does not use any host namespaces", () => {
    // Setup the isExempt mock to return false for this test
    vi.mocked(exemptions.isExempt).mockReturnValue(false);

    // Pod spec already has hostNetwork, hostIPC, and hostPID set to false in beforeEach

    // Call the function under test
    validateDisallowHostNamespaces(mockRequest);

    // Verify Approve was called and Deny was not
    expect(mockRequest.Approve).toHaveBeenCalled();
    expect(mockRequest.Deny).not.toHaveBeenCalled();
  });
});

describe("validateRestrictHostPorts", () => {
  // Create a properly typed mock for PeprValidateRequest
  let mockRequest: PeprValidateRequest<a.Pod>;

  beforeEach(() => {
    // Reset mocks between tests
    vi.clearAllMocks();

    // Initialize the mock request with proper typing
    mockRequest = {
      Raw: {
        apiVersion: "v1",
        kind: "Pod",
        metadata: {
          name: "test-pod",
          namespace: "default",
        },
        spec: {
          containers: [
            {
              name: "test-container",
              image: "nginx",
              ports: [],
            },
          ],
        },
      },
      Approve: vi.fn().mockReturnValue({
        allowed: true,
        message: "Approved",
      }),
      Deny: vi.fn().mockReturnValue({
        allowed: false,
        message: "Denied",
      }),
      HasLabel: vi.fn(),
      HasAnnotation: vi.fn(),
      IsKind: vi.fn(),
    } as unknown as PeprValidateRequest<a.Pod>;
  });

  it("should approve request if pod is exempt from policy", () => {
    // Setup the isExempt mock to return true for this test
    vi.mocked(exemptions.isExempt).mockReturnValue(true);

    // Call the function under test
    validateRestrictHostPorts(mockRequest);

    // Verify isExempt was called with correct parameters
    expect(exemptions.isExempt).toHaveBeenCalledWith(mockRequest, Policy.RestrictHostPorts);

    // Verify Approve was called and Deny was not
    expect(mockRequest.Approve).toHaveBeenCalled();
    expect(mockRequest.Deny).not.toHaveBeenCalled();
  });

  it("should deny request if pod has container with host port", () => {
    // Setup the isExempt mock to return false for this test
    vi.mocked(exemptions.isExempt).mockReturnValue(false);

    // Setup containers mock to return containers with host ports
    const containerPorts: V1ContainerPort[] = [{ containerPort: 80, hostPort: 8080 }];
    const container = { name: "test-container", ports: containerPorts };
    vi.mocked(sdk.containers).mockReturnValue([container]);

    // Call the function under test
    validateRestrictHostPorts(mockRequest);

    // Verify Deny was called with the correct message
    expect(mockRequest.Deny).toHaveBeenCalledWith("Host ports are not allowed.");
    expect(mockRequest.Approve).not.toHaveBeenCalled();
  });

  it("should approve request if pod has no container with host port", () => {
    // Setup the isExempt mock to return false for this test
    vi.mocked(exemptions.isExempt).mockReturnValue(false);

    // Setup containers mock to return containers without host ports
    const containerPorts: V1ContainerPort[] = [{ containerPort: 80 }];
    const container = { name: "test-container", ports: containerPorts };
    vi.mocked(sdk.containers).mockReturnValue([container]);

    // Call the function under test
    validateRestrictHostPorts(mockRequest);

    // Verify Approve was called and Deny was not
    expect(mockRequest.Approve).toHaveBeenCalled();
    expect(mockRequest.Deny).not.toHaveBeenCalled();
  });
});

describe("validateRestrictExternalNames", () => {
  // Create a properly typed mock for PeprValidateRequest
  let mockRequest: PeprValidateRequest<a.Service>;

  beforeEach(() => {
    // Reset mocks between tests
    vi.clearAllMocks();

    // Initialize the mock request with proper typing
    mockRequest = {
      Raw: {
        apiVersion: "v1",
        kind: "Service",
        metadata: {
          name: "test-service",
          namespace: "default",
        },
        spec: {
          type: "ClusterIP",
          ports: [{ port: 80 }],
        },
      },
      Approve: vi.fn().mockReturnValue({
        allowed: true,
        message: "Approved",
      }),
      Deny: vi.fn().mockReturnValue({
        allowed: false,
        message: "Denied",
      }),
      HasLabel: vi.fn(),
      HasAnnotation: vi.fn(),
      IsKind: vi.fn(),
    } as unknown as PeprValidateRequest<a.Service>;
  });

  it("should approve request if service is exempt from policy", () => {
    // Setup the isExempt mock to return true for this test
    vi.mocked(exemptions.isExempt).mockReturnValue(true);

    // Call the function under test
    validateRestrictExternalNames(mockRequest);

    // Verify isExempt was called with correct parameters
    expect(exemptions.isExempt).toHaveBeenCalledWith(mockRequest, Policy.RestrictExternalNames);

    // Verify Approve was called and Deny was not
    expect(mockRequest.Approve).toHaveBeenCalled();
    expect(mockRequest.Deny).not.toHaveBeenCalled();
  });

  it("should deny request if service is of type ExternalName", () => {
    // Setup the isExempt mock to return false for this test
    vi.mocked(exemptions.isExempt).mockReturnValue(false);

    // Set up the service to be of type ExternalName
    mockRequest.Raw.spec!.type = "ExternalName";

    // Call the function under test
    validateRestrictExternalNames(mockRequest);

    // Verify Deny was called with the correct message
    expect(mockRequest.Deny).toHaveBeenCalledWith("ExternalName services are not allowed.");
    expect(mockRequest.Approve).not.toHaveBeenCalled();
  });

  it("should approve request if service is not of type ExternalName", () => {
    // Setup the isExempt mock to return false for this test
    vi.mocked(exemptions.isExempt).mockReturnValue(false);

    // Service spec already has type ClusterIP from beforeEach

    // Call the function under test
    validateRestrictExternalNames(mockRequest);

    // Verify Approve was called and Deny was not
    expect(mockRequest.Approve).toHaveBeenCalled();
    expect(mockRequest.Deny).not.toHaveBeenCalled();
  });
});

describe("validateDisallowNodePortServices", () => {
  // Create a properly typed mock for PeprValidateRequest
  let mockRequest: PeprValidateRequest<a.Service>;

  beforeEach(() => {
    // Reset mocks between tests
    vi.clearAllMocks();

    // Initialize the mock request with proper typing
    mockRequest = {
      Raw: {
        apiVersion: "v1",
        kind: "Service",
        metadata: {
          name: "test-service",
          namespace: "default",
        },
        spec: {
          type: "ClusterIP",
          ports: [{ port: 80 }],
        },
      },
      Approve: vi.fn().mockReturnValue({
        allowed: true,
        message: "Approved",
      }),
      Deny: vi.fn().mockReturnValue({
        allowed: false,
        message: "Denied",
      }),
      HasLabel: vi.fn(),
      HasAnnotation: vi.fn(),
      IsKind: vi.fn(),
    } as unknown as PeprValidateRequest<a.Service>;
  });

  it("should approve request if service is exempt from policy", () => {
    // Setup the isExempt mock to return true for this test
    vi.mocked(exemptions.isExempt).mockReturnValue(true);

    // Call the function under test
    validateDisallowNodePortServices(mockRequest);

    // Verify isExempt was called with correct parameters
    expect(exemptions.isExempt).toHaveBeenCalledWith(mockRequest, Policy.DisallowNodePortServices);

    // Verify Approve was called and Deny was not
    expect(mockRequest.Approve).toHaveBeenCalled();
    expect(mockRequest.Deny).not.toHaveBeenCalled();
  });

  it("should deny request if service is of type NodePort", () => {
    // Setup the isExempt mock to return false for this test
    vi.mocked(exemptions.isExempt).mockReturnValue(false);

    // Set up the service to be of type NodePort
    mockRequest.Raw.spec!.type = "NodePort";

    // Call the function under test
    validateDisallowNodePortServices(mockRequest);

    // Verify Deny was called with the correct message
    expect(mockRequest.Deny).toHaveBeenCalledWith("NodePort services are not allowed.");
    expect(mockRequest.Approve).not.toHaveBeenCalled();
  });

  it("should approve request if service is not of type NodePort", () => {
    // Setup the isExempt mock to return false for this test
    vi.mocked(exemptions.isExempt).mockReturnValue(false);

    // Service spec already has type ClusterIP from beforeEach

    // Call the function under test
    validateDisallowNodePortServices(mockRequest);

    // Verify Approve was called and Deny was not
    expect(mockRequest.Approve).toHaveBeenCalled();
    expect(mockRequest.Deny).not.toHaveBeenCalled();
  });
});
