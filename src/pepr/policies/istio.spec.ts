/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s, kind } from "pepr";
import { describe, expect, it } from "vitest";
// Import for kubectl testing
import { spawnSync } from "child_process";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const failIfReached = () => expect(true).toBe(false);

describe("restrict istio sidecar configuration overrides", () => {
  // TODO: enable this test once we enforce the policy
  it.skip("should prevent single dangerous istio sidecar configuration annotation", async () => {
    const expected = (e: Error) =>
      expect(e).toMatchObject({
        ok: false,
        data: {
          message: expect.stringContaining(
            "The following istio annotations can modify secure sidecar configuration and are not allowed: sidecar.istio.io/proxyImage",
          ),
        },
      });

    return K8s(kind.Pod)
      .Apply({
        metadata: {
          name: "istio-bad-annotation",
          namespace: "policy-tests",
          annotations: {
            "sidecar.istio.io/proxyImage": "malicious/image:latest",
          },
        },
        spec: {
          containers: [
            {
              name: "test",
              image: "127.0.0.1/fake",
            },
          ],
        },
      })
      .then(failIfReached)
      .catch(expected);
  });

  // TODO: delete this test once we enforce the policy
  // Note: This test is designed to run with kubectl directly to verify the warning message
  it("should warn on dangerous istio sidecar configuration annotation", () => {
    // Create a temporary directory and file for the pod manifest
    const tmpDir = mkdtempSync(join(tmpdir(), "istio-test-"));
    const podYamlPath = join(tmpDir, "istio-warning-test.yaml");

    // Create the YAML file for the pod with dangerous annotation
    const podYaml = `
apiVersion: v1
kind: Pod
metadata:
  name: istio-warning-bad-annotation
  namespace: policy-tests
  annotations:
    sidecar.istio.io/proxyImage: "malicious/image:latest"
spec:
  containers:
  - name: test
    image: 127.0.0.1/fake
`;
    writeFileSync(podYamlPath, podYaml);

    try {
      // Apply the Pod using kubectl and capture stdout and stderr separately
      const result = spawnSync("uds", ["zarf", "tools", "kubectl", "apply", "-f", podYamlPath], {
        encoding: "utf-8",
        stdio: "pipe",
      });

      // Verify that warnings are present in stderr
      expect(result.stderr).toContain(
        "Warning: The following istio annotations can modify secure sidecar configuration and should be removed/exempted:",
      );
      expect(result.stderr).toContain("sidecar.istio.io/proxyImage");

      // Verify that the resource was created successfully in stdout
      expect(result.stdout).toContain("pod/istio-warning-bad-annotation created");
      expect(result.status).toBe(0); // Zero exit code indicates success
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // TODO: enable this test once we enforce the policy
  it.skip("should prevent multiple dangerous istio sidecar configuration annotations", async () => {
    const blockedAnnotations = [
      "proxy.istio.io/config",
      "sidecar.istio.io/bootstrapOverride",
      "sidecar.istio.io/discoveryAddress",
      "sidecar.istio.io/proxyImage",
      "sidecar.istio.io/userVolume",
    ].sort(); // ensure consistent order for tests

    const expected = (e: Error) =>
      expect(e).toMatchObject({
        ok: false,
        data: {
          message: expect.stringContaining(
            `The following istio annotations can modify secure sidecar configuration and are not allowed: ${blockedAnnotations.join(", ")}`,
          ),
        },
      });

    return K8s(kind.Pod)
      .Apply({
        metadata: {
          name: "istio-multiple-bad-annotations",
          namespace: "policy-tests",
          annotations: Object.fromEntries(
            blockedAnnotations.map(annotation => [annotation, "true"]),
          ),
        },
        spec: {
          containers: [
            {
              name: "test",
              image: "127.0.0.1/fake",
            },
          ],
        },
      })
      .then(failIfReached)
      .catch(expected);
  });

  // TODO: delete this test once we enforce the policy
  // Note: This test is designed to run with kubectl directly to verify the warning message
  it("should warn on multiple dangerous istio sidecar configuration annotations", () => {
    // Create a temporary directory and file for the pod manifest
    const tmpDir = mkdtempSync(join(tmpdir(), "istio-test-"));
    const podYamlPath = join(tmpDir, "istio-warning-test.yaml");

    const blockedAnnotations = [
      "proxy.istio.io/config",
      "sidecar.istio.io/bootstrapOverride",
      "sidecar.istio.io/discoveryAddress",
      "sidecar.istio.io/proxyImage",
      "sidecar.istio.io/userVolume",
    ];

    // Create annotations object for YAML
    const annotations: Record<string, string> = {};
    blockedAnnotations.forEach(annotation => {
      annotations[annotation] = "true";
    });

    // Create the YAML file for the pod with multiple dangerous annotations
    const podYaml = `
apiVersion: v1
kind: Pod
metadata:
  name: istio-warning-multiple-bad-annotations
  namespace: policy-tests
  annotations:
    proxy.istio.io/config: "true"
    sidecar.istio.io/bootstrapOverride: "true"
    sidecar.istio.io/discoveryAddress: "true"
    sidecar.istio.io/proxyImage: "true"
    sidecar.istio.io/userVolume: "true"
spec:
  containers:
  - name: test
    image: 127.0.0.1/fake
`;
    writeFileSync(podYamlPath, podYaml);

    try {
      // Apply the Pod using kubectl and capture stdout and stderr separately
      const result = spawnSync("uds", ["zarf", "tools", "kubectl", "apply", "-f", podYamlPath], {
        encoding: "utf-8",
        stdio: "pipe",
      });

      // Verify that warnings are present in stderr
      expect(result.stderr).toContain(
        "Warning: The following istio annotations can modify secure sidecar configuration and should be removed/exempted:",
      );

      // Check that each annotation is mentioned in the warning
      blockedAnnotations.forEach(annotation => {
        expect(result.stderr).toContain(annotation);
      });

      // Verify that the resource was created successfully in stdout
      expect(result.stdout).toContain("pod/istio-warning-multiple-bad-annotations created");
      expect(result.status).toBe(0); // Zero exit code indicates success
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe("restrict istio traffic interception overrides", () => {
  // TODO: enable this test once we enforce the policy
  it.skip("should prevent single dangerous traffic interception annotation", async () => {
    const expected = (e: Error) =>
      expect(e).toMatchObject({
        ok: false,
        data: {
          message: expect.stringContaining(
            "The following istio annotations can modify secure traffic interception are not allowed: traffic.sidecar.istio.io/excludeOutboundPorts",
          ),
        },
      });

    return K8s(kind.Pod)
      .Apply({
        metadata: {
          name: "istio-traffic-override",
          namespace: "policy-tests",
          annotations: {
            "traffic.sidecar.istio.io/excludeOutboundPorts": "443,8443",
          },
        },
        spec: {
          containers: [
            {
              name: "test",
              image: "127.0.0.1/fake",
            },
          ],
        },
      })
      .then(failIfReached)
      .catch(expected);
  });

  // TODO: delete this test once we enforce the policy
  // Note: This test is designed to run with kubectl directly to verify the warning message
  it("should warn on dangerous traffic interception annotation", () => {
    // Create a temporary directory and file for the pod manifest
    const tmpDir = mkdtempSync(join(tmpdir(), "istio-test-"));
    const podYamlPath = join(tmpDir, "istio-warning-test.yaml");

    // Create the YAML file for the pod with dangerous annotation
    const podYaml = `
apiVersion: v1
kind: Pod
metadata:
  name: istio-warning-traffic-override
  namespace: policy-tests
  annotations:
    traffic.sidecar.istio.io/excludeOutboundPorts: "443,8443"
spec:
  containers:
  - name: test
    image: 127.0.0.1/fake
`;
    writeFileSync(podYamlPath, podYaml);

    try {
      // Apply the Pod using kubectl and capture stdout and stderr separately
      const result = spawnSync("uds", ["zarf", "tools", "kubectl", "apply", "-f", podYamlPath], {
        encoding: "utf-8",
        stdio: "pipe",
      });

      // Verify that warnings are present in stderr
      expect(result.stderr).toContain(
        "Warning: The following istio annotations can modify secure traffic interception and should be removed/exempted:",
      );
      expect(result.stderr).toContain("traffic.sidecar.istio.io/excludeOutboundPorts");

      // Verify that the resource was created successfully in stdout
      expect(result.stdout).toContain("pod/istio-warning-traffic-override created");
      expect(result.status).toBe(0); // Zero exit code indicates success
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // TODO: enable this test once we enforce the policy
  it.skip("should prevent multiple dangerous traffic interception annotations", async () => {
    const blockedAnnotations = [
      "sidecar.istio.io/interceptionMode",
      "traffic.sidecar.istio.io/excludeInboundPorts",
      "traffic.sidecar.istio.io/excludeOutboundIPRanges",
    ].sort(); // ensure consistent order for tests

    const expected = (e: Error) =>
      expect(e).toMatchObject({
        ok: false,
        data: {
          message: expect.stringContaining(
            `The following istio annotations can modify secure traffic interception are not allowed: ${blockedAnnotations.join(", ")}`,
          ),
        },
      });

    return K8s(kind.Pod)
      .Apply({
        metadata: {
          name: "istio-multiple-traffic-overrides",
          namespace: "policy-tests",
          annotations: Object.fromEntries(
            blockedAnnotations.map(annotation => [annotation, "true"]),
          ),
        },
        spec: {
          containers: [
            {
              name: "test",
              image: "127.0.0.1/fake",
            },
          ],
        },
      })
      .then(failIfReached)
      .catch(expected);
  });

  // TODO: delete this test once we enforce the policy
  // Note: This test is designed to run with kubectl directly to verify the warning message
  it("should warn on multiple dangerous traffic interception annotations", () => {
    // Create a temporary directory and file for the pod manifest
    const tmpDir = mkdtempSync(join(tmpdir(), "istio-test-"));
    const podYamlPath = join(tmpDir, "istio-warning-test.yaml");

    const blockedAnnotations = [
      "sidecar.istio.io/interceptionMode",
      "traffic.sidecar.istio.io/excludeInboundPorts",
      "traffic.sidecar.istio.io/excludeOutboundIPRanges",
    ];

    // Create annotations object for YAML
    const annotations: Record<string, string> = {};
    blockedAnnotations.forEach(annotation => {
      annotations[annotation] = "true";
    });

    // Create the YAML file for the pod with multiple dangerous annotations
    const podYaml = `
apiVersion: v1
kind: Pod
metadata:
  name: istio-warning-multiple-traffic-overrides
  namespace: policy-tests
  annotations:
    sidecar.istio.io/interceptionMode: "true"
    traffic.sidecar.istio.io/excludeInboundPorts: "true"
    traffic.sidecar.istio.io/excludeOutboundIPRanges: "true"
spec:
  containers:
  - name: test
    image: 127.0.0.1/fake
`;
    writeFileSync(podYamlPath, podYaml);

    try {
      // Apply the Pod using kubectl and capture stdout and stderr separately
      const result = spawnSync("uds", ["zarf", "tools", "kubectl", "apply", "-f", podYamlPath], {
        encoding: "utf-8",
        stdio: "pipe",
      });

      // Verify that warnings are present in stderr
      expect(result.stderr).toContain(
        "Warning: The following istio annotations can modify secure traffic interception and should be removed/exempted:",
      );

      // Check that each annotation is mentioned in the warning
      blockedAnnotations.forEach(annotation => {
        expect(result.stderr).toContain(annotation);
      });

      // Verify that the resource was created successfully in stdout
      expect(result.stdout).toContain("pod/istio-warning-multiple-traffic-overrides created");
      expect(result.status).toBe(0); // Zero exit code indicates success
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe("restrict istio ambient overrides", () => {
  // TODO: enable this test once we enforce the policy
  it.skip("should prevent ambient override annotation", async () => {
    const expected = (e: Error) =>
      expect(e).toMatchObject({
        ok: false,
        data: {
          message: expect.stringContaining(
            "The following istio ambient annotations that can modify secure mesh behavior are not allowed: ambient.istio.io/bypass-inbound-capture",
          ),
        },
      });

    return K8s(kind.Pod)
      .Apply({
        metadata: {
          name: "istio-ambient-override",
          namespace: "policy-tests",
          annotations: {
            "ambient.istio.io/bypass-inbound-capture": "true",
          },
        },
        spec: {
          containers: [
            {
              name: "test",
              image: "127.0.0.1/fake",
            },
          ],
        },
      })
      .then(failIfReached)
      .catch(expected);
  });

  // TODO: delete this test once we enforce the policy
  // Note: This test is designed to run with kubectl directly to verify the warning message
  it("should warn on ambient override annotation", () => {
    // Create a temporary directory and file for the pod manifest
    const tmpDir = mkdtempSync(join(tmpdir(), "istio-test-"));
    const podYamlPath = join(tmpDir, "istio-warning-test.yaml");

    // Create the YAML file for the pod with ambient override annotation
    const podYaml = `
apiVersion: v1
kind: Pod
metadata:
  name: istio-warning-ambient-override
  namespace: policy-tests
  annotations:
    ambient.istio.io/bypass-inbound-capture: "true"
spec:
  containers:
  - name: test
    image: 127.0.0.1/fake
`;
    writeFileSync(podYamlPath, podYaml);

    try {
      // Apply the Pod using kubectl and capture stdout and stderr separately
      const result = spawnSync("uds", ["zarf", "tools", "kubectl", "apply", "-f", podYamlPath], {
        encoding: "utf-8",
        stdio: "pipe",
      });

      // Verify that warnings are present in stderr
      expect(result.stderr).toContain(
        "Warning: The following istio ambient annotations can modify secure mesh behavior and should be removed/exempted:",
      );
      expect(result.stderr).toContain("ambient.istio.io/bypass-inbound-capture");

      // Verify that the resource was created successfully in stdout
      expect(result.stdout).toContain("pod/istio-warning-ambient-override created");
      expect(result.status).toBe(0); // Zero exit code indicates success
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
