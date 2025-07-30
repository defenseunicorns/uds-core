/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s, kind } from "pepr";
import { afterEach, beforeEach, describe, expect, it, Mock, vi } from "vitest";
import { parseImageRef, validateIstioImage } from "./common";

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
    expect(parseImageRef("   ")).toBeNull();
    // @ts-expect-error - testing invalid input
    expect(parseImageRef(null)).toBeNull();
    // @ts-expect-error - testing invalid input
    expect(parseImageRef(undefined)).toBeNull();
  });

  it("should handle simple repository names", () => {
    expect(parseImageRef("nginx")).toEqual({
      registry: "docker.io",
      repository: "library/nginx",
    });
  });

  it("should handle repository names with tags", () => {
    expect(parseImageRef("nginx:latest")).toEqual({
      registry: "docker.io",
      repository: "library/nginx",
    });
  });

  it("should handle repository names with digests", () => {
    expect(parseImageRef("nginx@sha256:abc123")).toEqual({
      registry: "docker.io",
      repository: "library/nginx",
    });
  });

  it("should handle namespaced repositories", () => {
    expect(parseImageRef("organization/nginx:latest")).toEqual({
      registry: "docker.io",
      repository: "organization/nginx",
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
    expect(validateIstioImage("docker.io/wrong/repo:1.16.0")).toBe(false);
  });

  it("should return false for images with wrong repository", () => {
    expect(validateIstioImage("quay.io/wrong/repo:1.16.0")).toBe(false);
    expect(validateIstioImage("registry1.dso.mil/wrong/repo:1.16.0")).toBe(false);
  });
});
