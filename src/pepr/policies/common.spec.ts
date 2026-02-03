/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { V1Container } from "@kubernetes/client-node";
import { a, K8s, kind, PeprValidateRequest } from "pepr";
import { afterEach, beforeEach, describe, expect, it, Mock, vi } from "vitest";
import {
  isIstioInitContainer,
  isIstioProxyContainer,
  parseImageRef,
  validateIstioImage,
} from "./common.js";

// Mock the K8s client
vi.mock("pepr", async () => {
  const originalModule = (await vi.importActual("pepr")) as object;
  return {
    ...originalModule,
    K8s: vi.fn(),
  };
});

describe("parseImageRef", () => {
  it("should handle empty input", () => {
    expect(parseImageRef("")).toBeNull();
  });

  it("should handle repository names", () => {
    expect(parseImageRef("istio/proxyv2")).toEqual({
      registry: "docker.io",
      repository: "istio/proxyv2",
    });
  });

  it("should handle repository names with tags", () => {
    expect(parseImageRef("istio/proxyv2:1.2.3")).toEqual({
      registry: "docker.io",
      repository: "istio/proxyv2",
    });
  });

  it("should handle repository names with digests", () => {
    expect(parseImageRef("istio/proxyv2@sha256:abc123")).toEqual({
      registry: "docker.io",
      repository: "istio/proxyv2",
    });
  });

  it("should handle non-namespaced repositories", () => {
    expect(parseImageRef("proxyv2:latest")).toEqual({
      registry: "docker.io",
      repository: "proxyv2",
    });
  });

  it("should handle custom registry without port", () => {
    expect(parseImageRef("registry.example.com/org/nginx:latest")).toEqual({
      registry: "registry.example.com",
      repository: "org/nginx",
    });
  });

  it("should handle custom registry with port", () => {
    expect(parseImageRef("registry.example.com:5000/org/nginx:latest")).toEqual({
      registry: "registry.example.com:5000",
      repository: "org/nginx",
    });
  });

  it("should handle IP addresses with port", () => {
    expect(parseImageRef("192.168.1.100:5000/org/nginx:latest")).toEqual({
      registry: "192.168.1.100:5000",
      repository: "org/nginx",
    });
  });

  it("should handle localhost with port", () => {
    expect(parseImageRef("localhost:5000/nginx:latest")).toEqual({
      registry: "localhost:5000",
      repository: "nginx",
    });
  });

  it("should return null on standalone registry without repository", () => {
    expect(parseImageRef("registry.example.com:5000")).toEqual(null);
  });

  it("should handle multi-level repository paths", () => {
    expect(parseImageRef("registry.example.com/org/team/service:1.0.0")).toEqual({
      registry: "registry.example.com",
      repository: "org/team/service",
    });
  });
});

describe("validateIstioImage", () => {
  beforeEach(async () => {
    // Set up the test environment
    vi.clearAllMocks();
    (K8s as Mock).mockImplementation(resourceKind => {
      if (resourceKind === kind.Pod) {
        return {
          InNamespace: vi.fn().mockReturnThis(),
          Get: vi.fn().mockResolvedValue({
            items: [
              {
                metadata: {
                  name: "test-pod",
                  namespace: "test-namespace",
                },
                spec: {
                  containers: [
                    {
                      name: "test-container",
                      image: "127.0.0.1:31999/pepr:1.0.0",
                    },
                  ],
                },
              },
            ],
          }),
        };
      }
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Test each flavor with its canonical registry
  it("should return true for unicorn flavor image with correct registry", () => {
    expect(validateIstioImage("quay.io/rfcurated/istio/proxyv2:1.16.0")).toBe(true);
  });

  it("should return true for upstream flavor image with correct registry", () => {
    expect(validateIstioImage("docker.io/istio/proxyv2:1.16.0")).toBe(true);
  });

  it("should return true for registry1 flavor image with correct registry", () => {
    expect(validateIstioImage("registry1.dso.mil/ironbank/tetrate/istio/proxyv2:1.16.0")).toBe(
      true,
    );
  });

  // Test with Zarf registry (current registry)
  it("should return true for any flavor image from the current registry", () => {
    expect(validateIstioImage("127.0.0.1:31999/istio/proxyv2:1.16.0")).toBe(true);
    expect(validateIstioImage("127.0.0.1:31999/ironbank/tetrate/istio/proxyv2:1.16.0")).toBe(true);
  });

  // Test with different tags and digests
  it("should handle images with tags and digests", () => {
    expect(validateIstioImage("quay.io/rfcurated/istio/proxyv2:latest")).toBe(true);
    expect(validateIstioImage("quay.io/rfcurated/istio/proxyv2@sha256:abc123")).toBe(true);
  });

  // Test negative cases
  it("should return false for invalid image references", () => {
    expect(validateIstioImage("")).toBe(false);
    expect(validateIstioImage(" ")).toBe(false);
    expect(validateIstioImage("@")).toBe(false);
    expect(validateIstioImage(":")).toBe(false);
  });

  it("should return false for images with wrong registry", () => {
    expect(validateIstioImage("wrong.registry/istio/proxyv2:1.16.0")).toBe(false);
    expect(validateIstioImage("localhost/repo:1.16.0")).toBe(false);
  });

  it("should return false for images with wrong repository", () => {
    expect(validateIstioImage("quay.io/wrong/repo:1.16.0")).toBe(false);
    expect(validateIstioImage("registry1.dso.mil/wrong/repo:1.16.0")).toBe(false);
  });
});

describe("isIstioProxyContainer", () => {
  it("should return true for a valid Istio proxy container", () => {
    // Create a valid Istio proxy container
    const validContainer: V1Container = {
      name: "istio-proxy",
      image: "docker.io/istio/proxyv2:1.16.0",
      ports: [{ name: "http-envoy-prom", containerPort: 15090 }],
      args: ["proxy", "sidecar"],
    };

    expect(isIstioProxyContainer(validContainer)).toBe(true);
  });

  it("should return false for container with wrong name", () => {
    const container: V1Container = {
      name: "not-istio-proxy",
      image: "docker.io/istio/proxyv2:1.16.0",
      ports: [{ name: "http-envoy-prom", containerPort: 15090 }],
      args: ["proxy", "sidecar"],
    };
    expect(isIstioProxyContainer(container)).toBe(false);
  });

  it("should return false for container with invalid image", () => {
    const container: V1Container = {
      name: "istio-proxy",
      image: "quay.io/wrong/repo:1.16.0",
      ports: [{ name: "http-envoy-prom", containerPort: 15090 }],
      args: ["proxy", "sidecar"],
    };
    expect(isIstioProxyContainer(container)).toBe(false);
  });

  it("should return false for container with wrong port name", () => {
    const container: V1Container = {
      name: "istio-proxy",
      image: "docker.io/istio/proxyv2:1.16.0",
      ports: [{ name: "wrong-port-name", containerPort: 15090 }],
      args: ["proxy", "sidecar"],
    };
    expect(isIstioProxyContainer(container)).toBe(false);
  });

  it("should return false for container with wrong first arg", () => {
    const container: V1Container = {
      name: "istio-proxy",
      image: "docker.io/istio/proxyv2:1.16.0",
      ports: [{ name: "http-envoy-prom", containerPort: 15090 }],
      args: ["not-proxy", "sidecar"],
    };
    expect(isIstioProxyContainer(container)).toBe(false);
  });

  it("should return false for container with no image", () => {
    const container: V1Container = {
      name: "istio-proxy",
      ports: [{ name: "http-envoy-prom", containerPort: 15090 }],
      args: ["proxy", "sidecar"],
    };
    expect(isIstioProxyContainer(container)).toBe(false);
  });
});

describe("isIstioInitContainer", () => {
  class TestPodRequest implements Partial<PeprValidateRequest<a.Pod>> {
    HasAnnotation: (key: string) => boolean;
    Raw: a.Pod;

    constructor(hasIstioAnnotation: boolean, initContainers: V1Container[]) {
      this.HasAnnotation = (key: string) => hasIstioAnnotation && key === "sidecar.istio.io/status";

      this.Raw = {
        apiVersion: "v1",
        kind: "Pod",
        metadata: {
          name: "test-pod",
          namespace: "default",
          annotations: hasIstioAnnotation
            ? { "sidecar.istio.io/status": '{"version":"1.20.0"}' }
            : {},
        },
        spec: {
          containers: [],
          initContainers: initContainers,
        },
      } as a.Pod;
    }
  }

  // Helper function to create a test double for PeprValidateRequest
  function createPodRequest(
    hasIstioAnnotation: boolean,
    initContainers: V1Container[],
  ): PeprValidateRequest<a.Pod> {
    return new TestPodRequest(
      hasIstioAnnotation,
      initContainers,
    ) as unknown as PeprValidateRequest<a.Pod>;
  }

  it("should return true for a valid Istio init container", () => {
    // Create a valid istio-proxy container for initContainers
    const istioProxyContainer: V1Container = {
      name: "istio-proxy",
      image: "docker.io/istio/proxyv2:1.16.0",
      ports: [{ name: "http-envoy-prom", containerPort: 15090 }],
      args: ["proxy", "sidecar"],
    };

    // Create a mock request with required annotation and istio-proxy in initContainers
    const mockRequest = createPodRequest(true, [istioProxyContainer]);

    // Create a valid Istio init container
    const validContainer: V1Container = {
      name: "istio-init",
      image: "docker.io/istio/proxyv2:1.16.0",
      args: ["istio-iptables"],
    };

    expect(isIstioInitContainer(mockRequest, validContainer)).toBe(true);
  });

  it("should return false for a non-Istio init container", () => {
    // Create a non-istio container for initContainers
    const nonIstioContainer: V1Container = {
      name: "some-other-container",
      image: "some-image:latest",
      args: ["some-command"],
    };

    // Create a mock request with required annotation but no istio-proxy in initContainers
    const mockRequest = createPodRequest(true, [nonIstioContainer]);

    // Create a container that looks like an istio-init container
    const container: V1Container = {
      name: "istio-init",
      image: "docker.io/istio/proxyv2:1.16.0",
      args: ["istio-iptables"],
    };

    expect(isIstioInitContainer(mockRequest, container)).toBe(false);
  });

  it("should return false when request is missing the required annotation", () => {
    // Create a valid istio-proxy container for initContainers
    const istioProxyContainer: V1Container = {
      name: "istio-proxy",
      image: "docker.io/istio/proxyv2:1.16.0",
      ports: [{ name: "http-envoy-prom", containerPort: 15090 }],
      args: ["proxy", "sidecar"],
    };

    // Create a mock request WITHOUT the required annotation
    const mockRequest = createPodRequest(false, [istioProxyContainer]);

    // Create a valid Istio init container
    const validContainer: V1Container = {
      name: "istio-init",
      image: "docker.io/istio/proxyv2:1.16.0",
      args: ["istio-iptables"],
    };

    expect(isIstioInitContainer(mockRequest, validContainer)).toBe(false);
  });

  it("should return false when container has wrong name", () => {
    // Create a valid istio-proxy container for initContainers
    const istioProxyContainer: V1Container = {
      name: "istio-proxy",
      image: "docker.io/istio/proxyv2:1.16.0",
      ports: [{ name: "http-envoy-prom", containerPort: 15090 }],
      args: ["proxy", "sidecar"],
    };

    // Create a mock request with required annotation and istio-proxy in initContainers
    const mockRequest = createPodRequest(true, [istioProxyContainer]);

    // Create a container with wrong name
    const containerWithWrongName: V1Container = {
      name: "not-istio-init",
      image: "docker.io/istio/proxyv2:1.16.0",
      args: ["istio-iptables"],
    };

    expect(isIstioInitContainer(mockRequest, containerWithWrongName)).toBe(false);
  });

  it("should return false when container has wrong first argument", () => {
    // Create a valid istio-proxy container for initContainers
    const istioProxyContainer: V1Container = {
      name: "istio-proxy",
      image: "docker.io/istio/proxyv2:1.16.0",
      ports: [{ name: "http-envoy-prom", containerPort: 15090 }],
      args: ["proxy", "sidecar"],
    };

    // Create a mock request with required annotation and istio-proxy in initContainers
    const mockRequest = createPodRequest(true, [istioProxyContainer]);

    // Create a container with wrong first argument
    const containerWithWrongArg: V1Container = {
      name: "istio-init",
      image: "docker.io/istio/proxyv2:1.16.0",
      args: ["wrong-arg"],
    };

    expect(isIstioInitContainer(mockRequest, containerWithWrongArg)).toBe(false);
  });

  it("should return false when container has invalid image", () => {
    // Create a valid istio-proxy container for initContainers
    const istioProxyContainer: V1Container = {
      name: "istio-proxy",
      image: "docker.io/istio/proxyv2:1.16.0",
      ports: [{ name: "http-envoy-prom", containerPort: 15090 }],
      args: ["proxy", "sidecar"],
    };

    // Create a mock request with required annotation and istio-proxy in initContainers
    const mockRequest = createPodRequest(true, [istioProxyContainer]);

    // Create a container with invalid image
    const containerWithInvalidImage: V1Container = {
      name: "istio-init",
      image: "docker.io/not-istio/invalid-image:1.0.0", // Not a valid istio image
      args: ["istio-iptables"],
    };

    expect(isIstioInitContainer(mockRequest, containerWithInvalidImage)).toBe(false);
  });

  it("should return false when container has command defined", () => {
    // Create a valid istio-proxy container for initContainers
    const istioProxyContainer: V1Container = {
      name: "istio-proxy",
      image: "docker.io/istio/proxyv2:1.16.0",
      ports: [{ name: "http-envoy-prom", containerPort: 15090 }],
      args: ["proxy", "sidecar"],
    };

    // Create a mock request with required annotation and istio-proxy in initContainers
    const mockRequest = createPodRequest(true, [istioProxyContainer]);

    // Create a container with command defined (should be undefined)
    const containerWithCommand: V1Container = {
      name: "istio-init",
      image: "docker.io/istio/proxyv2:1.16.0",
      command: ["/bin/sh"],
      args: ["istio-iptables"],
    };

    expect(isIstioInitContainer(mockRequest, containerWithCommand)).toBe(false);
  });

  it("should return false when container has no image", () => {
    // Create a valid istio-proxy container for initContainers
    const istioProxyContainer: V1Container = {
      name: "istio-proxy",
      image: "docker.io/istio/proxyv2:1.16.0",
      ports: [{ name: "http-envoy-prom", containerPort: 15090 }],
      args: ["proxy", "sidecar"],
    };

    // Create a mock request with required annotation and istio-proxy in initContainers
    const mockRequest = createPodRequest(true, [istioProxyContainer]);

    // Create a container with image missing
    const containerWithCommand: V1Container = {
      name: "istio-init",
      args: ["istio-iptables"],
    };

    expect(isIstioInitContainer(mockRequest, containerWithCommand)).toBe(false);
  });
});
