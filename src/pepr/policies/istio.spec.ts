/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { V1PodSecurityContext } from "@kubernetes/client-node";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Policy } from "../operator/crd";

// Mock modules before imports
vi.mock("./common", () => {
  const mockValidate = vi.fn();
  const mockMutate = vi.fn(() => ({ Validate: mockValidate }));
  const mockIsCreatedOrUpdated = vi.fn(() => ({ Mutate: mockMutate }));
  const mockWhen = vi.fn(() => ({ IsCreatedOrUpdated: mockIsCreatedOrUpdated }));

  return {
    When: mockWhen,
    isIstioProxyContainer: vi.fn().mockReturnValue(false),
  };
});

// Mock the exemptions module
vi.mock("./exemptions", () => ({
  isExempt: vi.fn(),
  markExemption: vi.fn(() => vi.fn()), // markExemption returns a function
}));

// Mock the pepr module
vi.mock("pepr", () => ({
  a: { Pod: {} },
  sdk: { containers: vi.fn().mockReturnValue([]) },
  PeprValidateRequest: function () {
    return {};
  },
}));

// Import modules after mocking
import { PeprValidateRequest, a, sdk } from "pepr";
import * as common from "./common";
import * as exemptions from "./exemptions";
import {
  validateRestrictIstioAmbientOverrides,
  validateRestrictIstioSidecarOverrides,
  validateRestrictIstioTrafficOverrides,
  validateRestrictIstioUser,
} from "./istio";

describe("Istio Policy Tests", () => {
  describe("validateRestrictIstioTrafficOverrides", () => {
    let mockRequest: PeprValidateRequest<a.Pod>;

    beforeEach(() => {
      vi.clearAllMocks();

      mockRequest = {
        Raw: {
          apiVersion: "v1",
          kind: "Pod",
          metadata: {
            name: "test-pod",
            namespace: "default",
            annotations: {},
            labels: {},
          },
          spec: {
            containers: [
              {
                name: "test-container",
                image: "nginx",
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
      validateRestrictIstioTrafficOverrides(mockRequest);

      // Verify isExempt was called with correct parameters
      expect(exemptions.isExempt).toHaveBeenCalledWith(
        mockRequest,
        Policy.RestrictIstioTrafficOverrides,
      );

      // Verify Approve was called and Deny was not
      expect(mockRequest.Approve).toHaveBeenCalled();
      expect(mockRequest.Deny).not.toHaveBeenCalled();
    });

    it("should deny request if pod has blocked traffic annotations", () => {
      // Setup the isExempt mock to return false for this test
      vi.mocked(exemptions.isExempt).mockReturnValue(false);

      // Add blocked annotation to the request
      mockRequest.Raw.metadata!.annotations = {
        "traffic.sidecar.istio.io/excludeOutboundPorts": "8080,9090",
      };

      // Call the function under test
      validateRestrictIstioTrafficOverrides(mockRequest);

      // Verify Deny was called with the correct message
      expect(mockRequest.Deny).toHaveBeenCalledWith(
        expect.stringContaining(
          "The following istio annotations or labels can modify secure traffic interception are not allowed",
        ),
      );
      expect(mockRequest.Approve).not.toHaveBeenCalled();
    });

    it("should allow sidecar.istio.io/inject=true annotation", () => {
      // Setup the isExempt mock to return false for this test
      vi.mocked(exemptions.isExempt).mockReturnValue(false);

      // Add the allowable annotation
      mockRequest.Raw.metadata!.annotations = {
        "sidecar.istio.io/inject": "true",
      };

      // Call the function under test
      validateRestrictIstioTrafficOverrides(mockRequest);

      // Verify Approve was called and Deny was not
      expect(mockRequest.Approve).toHaveBeenCalled();
      expect(mockRequest.Deny).not.toHaveBeenCalled();
    });

    it("should deny request if sidecar.istio.io/inject=false annotation is used", () => {
      // Setup the isExempt mock to return false for this test
      vi.mocked(exemptions.isExempt).mockReturnValue(false);

      // Add the disallowed annotation
      mockRequest.Raw.metadata!.annotations = {
        "sidecar.istio.io/inject": "false",
      };

      // Call the function under test
      validateRestrictIstioTrafficOverrides(mockRequest);

      // Verify Deny was called
      expect(mockRequest.Deny).toHaveBeenCalled();
      expect(mockRequest.Approve).not.toHaveBeenCalled();
    });

    it("should allow annotations in istio-system namespace", () => {
      // Setup the isExempt mock to return false for this test
      vi.mocked(exemptions.isExempt).mockReturnValue(false);

      // Set namespace to istio-system
      mockRequest.Raw.metadata!.namespace = "istio-system";

      // Add normally blocked annotation
      mockRequest.Raw.metadata!.annotations = {
        "sidecar.istio.io/inject": "false",
      };

      // Call the function under test
      validateRestrictIstioTrafficOverrides(mockRequest);

      // Verify Approve was called
      expect(mockRequest.Approve).toHaveBeenCalled();
      expect(mockRequest.Deny).not.toHaveBeenCalled();
    });

    it("should allow sidecar.istio.io/inject label on Istio waypoint pods", () => {
      // Setup the isExempt mock to return false for this test
      vi.mocked(exemptions.isExempt).mockReturnValue(false);

      // Set up an Istio waypoint pod
      const proxyContainer = {
        name: "istio-proxy",
        image: "istio/proxyv2",
        args: ["proxy", "waypoint"],
      };
      vi.mocked(sdk.containers).mockReturnValue([proxyContainer]);
      vi.mocked(common.isIstioProxyContainer).mockReturnValue(true);

      // Add the sidecar.istio.io/inject label
      mockRequest.Raw.metadata!.labels = {
        "sidecar.istio.io/inject": "false",
      };

      // Call the function under test
      validateRestrictIstioTrafficOverrides(mockRequest);

      // Verify Approve was called
      expect(mockRequest.Approve).toHaveBeenCalled();
      expect(mockRequest.Deny).not.toHaveBeenCalled();
    });

    it("should deny request if pod has blocked traffic labels", () => {
      // Setup the isExempt mock to return false for this test
      vi.mocked(exemptions.isExempt).mockReturnValue(false);
      vi.mocked(common.isIstioProxyContainer).mockReturnValue(false);

      // Add blocked label to the request
      mockRequest.Raw.metadata!.labels = {
        "sidecar.istio.io/inject": "false",
      };

      // Call the function under test
      validateRestrictIstioTrafficOverrides(mockRequest);

      // Verify Deny was called
      expect(mockRequest.Deny).toHaveBeenCalled();
      expect(mockRequest.Approve).not.toHaveBeenCalled();
    });

    it("should approve request if pod has no blocked annotations or labels", () => {
      // Setup the isExempt mock to return false for this test
      vi.mocked(exemptions.isExempt).mockReturnValue(false);

      // Add allowed annotations and labels to the request
      mockRequest.Raw.metadata!.annotations = {
        "safe.annotation/example": "value",
      };
      mockRequest.Raw.metadata!.labels = {
        "safe.label/example": "value",
      };

      // Call the function under test
      validateRestrictIstioTrafficOverrides(mockRequest);

      // Verify Approve was called and Deny was not
      expect(mockRequest.Approve).toHaveBeenCalled();
      expect(mockRequest.Deny).not.toHaveBeenCalled();
    });
  });

  describe("validateRestrictIstioAmbientOverrides", () => {
    let mockRequest: PeprValidateRequest<a.Pod>;

    beforeEach(() => {
      vi.clearAllMocks();

      mockRequest = {
        Raw: {
          apiVersion: "v1",
          kind: "Pod",
          metadata: {
            name: "test-pod",
            namespace: "default",
            annotations: {},
          },
          spec: {
            containers: [
              {
                name: "test-container",
                image: "nginx",
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
      validateRestrictIstioAmbientOverrides(mockRequest);

      // Verify isExempt was called with correct parameters
      expect(exemptions.isExempt).toHaveBeenCalledWith(
        mockRequest,
        Policy.RestrictIstioAmbientOverrides,
      );

      // Verify Approve was called and Deny was not
      expect(mockRequest.Approve).toHaveBeenCalled();
      expect(mockRequest.Deny).not.toHaveBeenCalled();
    });

    it("should deny request if pod has blocked ambient annotations", () => {
      // Setup the isExempt mock to return false for this test
      vi.mocked(exemptions.isExempt).mockReturnValue(false);

      // Add blocked annotation to the request
      mockRequest.Raw.metadata!.annotations = {
        "ambient.istio.io/bypass-inbound-capture": "true",
      };

      // Call the function under test
      validateRestrictIstioAmbientOverrides(mockRequest);

      // Verify Deny was called with the correct message
      expect(mockRequest.Deny).toHaveBeenCalledWith(
        expect.stringContaining(
          "The following istio ambient annotations that can modify secure mesh behavior are not allowed",
        ),
      );
      expect(mockRequest.Approve).not.toHaveBeenCalled();
    });

    it("should approve request if pod has no blocked ambient annotations", () => {
      // Setup the isExempt mock to return false for this test
      vi.mocked(exemptions.isExempt).mockReturnValue(false);

      // Add allowed annotations to the request
      mockRequest.Raw.metadata!.annotations = {
        "safe.annotation/example": "value",
      };

      // Call the function under test
      validateRestrictIstioAmbientOverrides(mockRequest);

      // Verify Approve was called and Deny was not
      expect(mockRequest.Approve).toHaveBeenCalled();
      expect(mockRequest.Deny).not.toHaveBeenCalled();
    });
  });

  describe("validateRestrictIstioSidecarOverrides", () => {
    let mockRequest: PeprValidateRequest<a.Pod>;

    beforeEach(() => {
      vi.clearAllMocks();

      mockRequest = {
        Raw: {
          apiVersion: "v1",
          kind: "Pod",
          metadata: {
            name: "test-pod",
            namespace: "default",
            annotations: {},
          },
          spec: {
            containers: [
              {
                name: "test-container",
                image: "nginx",
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
      validateRestrictIstioSidecarOverrides(mockRequest);

      // Verify isExempt was called with correct parameters
      expect(exemptions.isExempt).toHaveBeenCalledWith(
        mockRequest,
        Policy.RestrictIstioSidecarOverrides,
      );

      // Verify Approve was called and Deny was not
      expect(mockRequest.Approve).toHaveBeenCalled();
      expect(mockRequest.Deny).not.toHaveBeenCalled();
    });

    it("should deny request if pod has blocked annotations", () => {
      // Setup the isExempt mock to return false for this test
      vi.mocked(exemptions.isExempt).mockReturnValue(false);

      // Add blocked annotation to the request
      mockRequest.Raw.metadata!.annotations = {
        "sidecar.istio.io/proxyImage": "malicious/image:latest",
      };

      // Call the function under test
      validateRestrictIstioSidecarOverrides(mockRequest);

      // Verify Deny was called with the correct message
      expect(mockRequest.Deny).toHaveBeenCalledWith(
        expect.stringContaining(
          "The following istio annotations can modify secure sidecar configuration and are not allowed",
        ),
      );
      expect(mockRequest.Approve).not.toHaveBeenCalled();
    });

    it("should approve request if pod has no blocked annotations", () => {
      // Setup the isExempt mock to return false for this test
      vi.mocked(exemptions.isExempt).mockReturnValue(false);

      // Add allowed annotations to the request
      mockRequest.Raw.metadata!.annotations = {
        "safe.annotation/example": "value",
      };

      // Call the function under test
      validateRestrictIstioSidecarOverrides(mockRequest);

      // Verify Approve was called and Deny was not
      expect(mockRequest.Approve).toHaveBeenCalled();
      expect(mockRequest.Deny).not.toHaveBeenCalled();
    });
  });

  describe("validateRestrictIstioUser", () => {
    let mockRequest: PeprValidateRequest<a.Pod>;

    beforeEach(() => {
      vi.clearAllMocks();

      mockRequest = {
        Raw: {
          apiVersion: "v1",
          kind: "Pod",
          metadata: {
            name: "test-pod",
            namespace: "default",
            annotations: {},
          },
          spec: {
            securityContext: {} as V1PodSecurityContext,
            containers: [
              {
                name: "test-container",
                image: "nginx",
                securityContext: {},
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
      validateRestrictIstioUser(mockRequest);

      // Verify isExempt was called with correct parameters
      expect(exemptions.isExempt).toHaveBeenCalledWith(mockRequest, Policy.RestrictIstioUser);

      // Verify Approve was called and Deny was not
      expect(mockRequest.Approve).toHaveBeenCalled();
      expect(mockRequest.Deny).not.toHaveBeenCalled();
    });

    it("should deny request if pod security context uses UID 1337", () => {
      // Setup the isExempt mock to return false for this test
      vi.mocked(exemptions.isExempt).mockReturnValue(false);

      // Set pod security context to use UID 1337
      mockRequest.Raw.spec!.securityContext = { runAsUser: 1337 } as V1PodSecurityContext;

      // Call the function under test
      validateRestrictIstioUser(mockRequest);

      // Verify Deny was called with the correct message
      expect(mockRequest.Deny).toHaveBeenCalledWith(
        "Pods cannot use UID/GID 1337 (Istio proxy) unless they are trusted Istio components",
      );
      expect(mockRequest.Approve).not.toHaveBeenCalled();
    });

    it("should deny request if container security context uses UID 1337", () => {
      // Setup the isExempt mock to return false for this test
      vi.mocked(exemptions.isExempt).mockReturnValue(false);

      // Make sure sdk.containers returns our mock container
      const container = {
        name: "test-container",
        image: "nginx",
        securityContext: { runAsUser: 1337 },
      };
      vi.mocked(sdk.containers).mockReturnValue([container]);

      // Make sure isIstioProxyContainer returns false (not an Istio proxy)
      vi.mocked(common.isIstioProxyContainer).mockReturnValue(false);

      // Call the function under test
      validateRestrictIstioUser(mockRequest);

      // Verify Deny was called with the correct message
      expect(mockRequest.Deny).toHaveBeenCalledWith(
        "Container 'test-container' cannot use UID/GID 1337 (Istio proxy) as it is not a trusted Istio component",
      );
      expect(mockRequest.Approve).not.toHaveBeenCalled();
    });

    it("should deny request if container security context uses GID 1337", () => {
      // Setup the isExempt mock to return false for this test
      vi.mocked(exemptions.isExempt).mockReturnValue(false);

      // Make sure sdk.containers returns our mock container
      const container = {
        name: "test-container",
        image: "nginx",
        securityContext: { runAsGroup: 1337 },
      };
      vi.mocked(sdk.containers).mockReturnValue([container]);

      // Make sure isIstioProxyContainer returns false (not an Istio proxy)
      vi.mocked(common.isIstioProxyContainer).mockReturnValue(false);

      // Call the function under test
      validateRestrictIstioUser(mockRequest);

      // Verify Deny was called with the correct message
      expect(mockRequest.Deny).toHaveBeenCalledWith(
        "Container 'test-container' cannot use UID/GID 1337 (Istio proxy) as it is not a trusted Istio component",
      );
      expect(mockRequest.Approve).not.toHaveBeenCalled();
    });

    it("should allow Istio proxy container to use UID/GID 1337", () => {
      // Setup the isExempt mock to return false for this test
      vi.mocked(exemptions.isExempt).mockReturnValue(false);

      // Make sure sdk.containers returns our mock container
      const container = {
        name: "istio-proxy",
        image: "istio/proxyv2",
        securityContext: { runAsUser: 1337, runAsGroup: 1337 },
      };
      vi.mocked(sdk.containers).mockReturnValue([container]);

      // Make sure isIstioProxyContainer returns true (is an Istio proxy)
      vi.mocked(common.isIstioProxyContainer).mockReturnValue(true);

      // Call the function under test
      validateRestrictIstioUser(mockRequest);

      // Should be approved since it's an Istio proxy
      expect(mockRequest.Approve).toHaveBeenCalled();
      expect(mockRequest.Deny).not.toHaveBeenCalled();
    });
  });
});
