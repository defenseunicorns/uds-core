/**
 * Copyright 2025-2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { V1Container, V1Pod, V1SecurityContext } from "@kubernetes/client-node";
import { describe, expect, it } from "vitest";
import {
  checkIstioAmbientOverrides,
  checkIstioSidecarOverrides,
  checkIstioTrafficInterceptionOverrides,
  findContainerUsingIstioUserID,
  isPodUsingIstioUserID,
} from "./istio";

describe("isPodUsingIstioUserID", () => {
  const testCases = [
    { name: "runAsUser", context: { runAsUser: 1337 } },
    { name: "runAsGroup", context: { runAsGroup: 1337 } },
    { name: "fsGroup", context: { fsGroup: 1337 } },
    { name: "supplementalGroups", context: { supplementalGroups: [1000, 1337, 2000] } },
  ];

  testCases.forEach(({ name, context }) => {
    it(`should return true when ${name} is 1337`, () => {
      const pod = { spec: { securityContext: context } };
      expect(isPodUsingIstioUserID(pod as V1Pod)).toBe(true);
    });
  });

  it("should return false for non-Istio security contexts", () => {
    const pod = {
      spec: {
        securityContext: {
          runAsUser: 1000,
          runAsGroup: 2000,
          fsGroup: 3000,
          supplementalGroups: [4000, 5000],
        },
      },
    };
    expect(isPodUsingIstioUserID(pod as V1Pod)).toBe(false);
  });

  it("should handle undefined spec or security context", () => {
    expect(isPodUsingIstioUserID({} as V1Pod)).toBe(false);
    expect(isPodUsingIstioUserID({ spec: {} } as V1Pod)).toBe(false);
  });
});

describe("findContainerUsingIstioUserID", () => {
  const createContainer = (name: string, context: V1SecurityContext = {}) => ({
    name,
    securityContext: context,
  });

  it("should find containers using Istio UID/GID", () => {
    const containers = [
      createContainer("container-1", { runAsUser: 1000 }),
      createContainer("container-2", { runAsUser: 1337 }),
      createContainer("container-3", { runAsGroup: 1337 }),
    ];

    expect(findContainerUsingIstioUserID(containers as V1Container[])).toBe("container-2");
  });

  it("should handle edge cases", () => {
    expect(findContainerUsingIstioUserID([])).toBeUndefined();
    expect(
      findContainerUsingIstioUserID([createContainer("no-context")] as V1Container[]),
    ).toBeUndefined();

    const noMatch = createContainer("no-match", { runAsUser: 1000 });
    expect(findContainerUsingIstioUserID([noMatch] as V1Container[])).toBeUndefined();
  });
});

describe("checkIstioAmbientOverrides", () => {
  const podWithAnnotations = (annotations: Record<string, string>) => ({
    metadata: { annotations },
  });

  it("should handle pod metadata variations", () => {
    expect(checkIstioAmbientOverrides({} as V1Pod)).toEqual([]);
    expect(checkIstioAmbientOverrides({ metadata: {} } as V1Pod)).toEqual([]);
  });

  it("should only detect blocked ambient annotations", () => {
    const pod = podWithAnnotations({
      "ambient.istio.io/bypass-inbound-capture": "true",
      "some.other/annotation": "value",
    });

    expect(checkIstioAmbientOverrides(pod as V1Pod)).toEqual([
      "ambient.istio.io/bypass-inbound-capture",
    ]);
  });
});

describe("checkIstioSidecarOverrides", () => {
  const podWithAnnotations = (annotations: Record<string, string>) => ({
    metadata: { annotations },
  });

  it("should handle pod metadata variations", () => {
    expect(checkIstioSidecarOverrides({} as V1Pod)).toEqual([]);
    expect(checkIstioSidecarOverrides({ metadata: {} } as V1Pod)).toEqual([]);
  });

  it("should detect blocked sidecar annotations", () => {
    const pod = podWithAnnotations({
      "sidecar.istio.io/bootstrapOverride": "/path",
      "proxy.istio.io/config": "custom",
      "sidecar.istio.io/userVolume": "vol",
      "sidecar.istio.io/userVolumeMount": "mount",
      "ignored/annotation": "value",
    });

    expect(checkIstioSidecarOverrides(pod as V1Pod)).toEqual([
      "proxy.istio.io/config",
      "sidecar.istio.io/bootstrapOverride",
      "sidecar.istio.io/userVolume",
      "sidecar.istio.io/userVolumeMount",
    ]);
  });

  it("should be case sensitive and not match partial names", () => {
    const pod = podWithAnnotations({
      "SIDECAR.ISTIO.IO/BOOTSTRAPOVERRIDE": "/path",
      "sidecar.istio.io/userVolumeX": "no-match",
    });

    expect(checkIstioSidecarOverrides(pod as V1Pod)).toEqual([]);
  });
});

describe("checkIstioTrafficInterceptionOverrides", () => {
  const mockContainers = [{ name: "app", image: "app:latest" }] as V1Container[];
  const waypointContainers = [
    {
      name: "istio-proxy",
      image: "docker.io/istio/proxyv2:1.20.0",
      args: ["proxy", "waypoint", "--log-level=info"],
      ports: [{ name: "http-envoy-prom", containerPort: 15020 }],
    },
  ] as V1Container[];

  const podWithAnnotations = (annotations: Record<string, string> = {}) => ({
    metadata: { annotations },
  });

  const podWithLabels = (labels: Record<string, string>) => ({
    metadata: { labels },
  });

  it("should handle pod metadata variations", () => {
    expect(checkIstioTrafficInterceptionOverrides(mockContainers, {} as V1Pod, false)).toEqual([]);
    expect(
      checkIstioTrafficInterceptionOverrides(mockContainers, { metadata: {} } as V1Pod, false),
    ).toEqual([]);
  });

  it("should detect blocked traffic interception settings", () => {
    const pod = {
      metadata: {
        namespace: "test-namespace",
        annotations: {
          "sidecar.istio.io/inject": "false",
          "traffic.sidecar.istio.io/excludeInboundPorts": "8080",
          "some.other/annotation": "value",
        },
        labels: {
          "sidecar.istio.io/inject": "disabled",
          app: "test-app",
        },
      },
    } as V1Pod;

    const result = checkIstioTrafficInterceptionOverrides(mockContainers, pod, false);
    expect(result).toContain("annotation sidecar.istio.io/inject");
    expect(result).toContain("annotation traffic.sidecar.istio.io/excludeInboundPorts");
    expect(result).toContain("label sidecar.istio.io/inject");
  });

  it("should ignore allowed cases", () => {
    const pod = podWithAnnotations({
      "sidecar.istio.io/inject": "true",
    });

    expect(checkIstioTrafficInterceptionOverrides(mockContainers, pod as V1Pod, false)).toEqual([]);
  });

  it("should ignore waypoint pods", () => {
    const pod = podWithLabels({
      "sidecar.istio.io/inject": "false",
    });

    expect(checkIstioTrafficInterceptionOverrides(waypointContainers, pod as V1Pod, false)).toEqual(
      [],
    );
  });

  it("should allow sidecar.istio.io/inject=false on CDI-managed pods in a kubevirt-workload namespace", () => {
    const annotation = { "sidecar.istio.io/inject": "false" };

    const importerPod = { metadata: { name: "importer-my-dv", annotations: annotation } };
    const uploadPod = { metadata: { name: "cdi-upload-my-dv", annotations: annotation } };
    const clonePod = { metadata: { name: "cdi-clone-abc123", annotations: annotation } };

    expect(
      checkIstioTrafficInterceptionOverrides(mockContainers, importerPod as V1Pod, true),
    ).toEqual([]);
    expect(
      checkIstioTrafficInterceptionOverrides(mockContainers, uploadPod as V1Pod, true),
    ).toEqual([]);
    expect(checkIstioTrafficInterceptionOverrides(mockContainers, clonePod as V1Pod, true)).toEqual(
      [],
    );
  });

  it("should block sidecar.istio.io/inject=false on CDI-named pods when the namespace lacks the workload label", () => {
    const annotation = { "sidecar.istio.io/inject": "false" };
    const importerPod = { metadata: { name: "importer-my-dv", annotations: annotation } };

    // isKubeVirtNamespace=false: a CDI pod name alone must not grant the exception.
    expect(
      checkIstioTrafficInterceptionOverrides(mockContainers, importerPod as V1Pod, false),
    ).toContain("annotation sidecar.istio.io/inject");
  });

  it("should block sidecar.istio.io/inject=false on non-CDI pods", () => {
    const pod = {
      metadata: {
        name: "my-app-pod",
        annotations: { "sidecar.istio.io/inject": "false" },
      },
    };

    expect(checkIstioTrafficInterceptionOverrides(mockContainers, pod as V1Pod, true)).toContain(
      "annotation sidecar.istio.io/inject",
    );
  });

  it("should allow kubevirt interface annotations on virt-launcher pods in a kubevirt-workload namespace", () => {
    const pod = {
      metadata: {
        name: "virt-launcher-my-vm-abc12",
        namespace: "my-vms",
        labels: { "kubevirt.io": "virt-launcher" },
        annotations: {
          "traffic.sidecar.istio.io/kubevirtInterfaces": "k6t-eth0",
          "istio.io/reroute-virtual-interfaces": "k6t-eth0",
        },
      },
    } as V1Pod;

    expect(checkIstioTrafficInterceptionOverrides(mockContainers, pod, true)).toEqual([]);
  });

  it("should block kubevirt interface annotations on non-launcher pods in a kubevirt-workload namespace", () => {
    const pod = {
      metadata: {
        name: "rogue-pod",
        namespace: "my-vms",
        annotations: {
          "traffic.sidecar.istio.io/kubevirtInterfaces": "k6t-eth0",
          "istio.io/reroute-virtual-interfaces": "k6t-eth0",
        },
      },
    } as V1Pod;

    const result = checkIstioTrafficInterceptionOverrides(mockContainers, pod, true);
    expect(result).toContain("annotation traffic.sidecar.istio.io/kubevirtInterfaces");
    expect(result).toContain("annotation istio.io/reroute-virtual-interfaces");
  });

  it("should block kubevirt interface annotations on a launcher pod when the namespace lacks the workload label", () => {
    const pod = {
      metadata: {
        name: "virt-launcher-my-vm-abc12",
        namespace: "not-a-vm-namespace",
        labels: { "kubevirt.io": "virt-launcher" },
        annotations: {
          "traffic.sidecar.istio.io/kubevirtInterfaces": "k6t-eth0",
        },
      },
    } as V1Pod;

    // isKubeVirtNamespace=false: launcher name + label are not enough without the ns label.
    expect(checkIstioTrafficInterceptionOverrides(mockContainers, pod, false)).toContain(
      "annotation traffic.sidecar.istio.io/kubevirtInterfaces",
    );
  });
});
