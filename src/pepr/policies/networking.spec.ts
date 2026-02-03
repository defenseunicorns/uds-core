/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { V1Container, V1PodSpec, V1ServiceSpec } from "@kubernetes/client-node";
import { describe, expect, it } from "vitest";
import {
  checkNoHostNamespaces,
  checkNoHostPorts,
  checkNotExternalNameService,
  checkNotNodePortService,
} from "./networking.js";

describe("checkNoHostNamespaces", () => {
  it("should approve pods that don't use host namespaces", () => {
    const podSpec: V1PodSpec = {
      containers: [],
    };

    expect(checkNoHostNamespaces(podSpec)).toBe(true);
  });

  it("should deny pods using hostNetwork", () => {
    const podSpec: V1PodSpec = {
      containers: [],
      hostNetwork: true,
    };

    expect(checkNoHostNamespaces(podSpec)).toBe(false);
  });

  it("should deny pods using hostIPC", () => {
    const podSpec: V1PodSpec = {
      containers: [],
      hostIPC: true,
    };

    expect(checkNoHostNamespaces(podSpec)).toBe(false);
  });

  it("should deny pods using hostPID", () => {
    const podSpec: V1PodSpec = {
      containers: [],
      hostPID: true,
    };

    expect(checkNoHostNamespaces(podSpec)).toBe(false);
  });

  it("should deny pods using multiple host namespaces", () => {
    const podSpec: V1PodSpec = {
      containers: [],
      hostNetwork: true,
      hostIPC: true,
      hostPID: false,
    };

    expect(checkNoHostNamespaces(podSpec)).toBe(false);
  });
});

describe("checkNoHostPorts", () => {
  it("should approve containers with no ports", () => {
    const containers: V1Container[] = [
      {
        name: "test-container",
      },
    ];

    expect(checkNoHostPorts(containers)).toBe(true);
  });

  it("should approve containers with ports but no host ports", () => {
    const containers: V1Container[] = [
      {
        name: "test-container",
        ports: [{ containerPort: 80 }, { containerPort: 443 }],
      },
    ];

    expect(checkNoHostPorts(containers)).toBe(true);
  });

  it("should deny containers with host ports", () => {
    const containers: V1Container[] = [
      {
        name: "test-container",
        ports: [{ containerPort: 80 }, { containerPort: 443, hostPort: 8443 }],
      },
    ];

    expect(checkNoHostPorts(containers)).toBe(false);
  });

  it("should deny when any container in a list has host ports", () => {
    const containers: V1Container[] = [
      {
        name: "container-1",
        ports: [{ containerPort: 80 }],
      },
      {
        name: "container-2",
        ports: [{ containerPort: 443, hostPort: 8443 }],
      },
      {
        name: "container-3",
        ports: [{ containerPort: 8080 }],
      },
    ];

    expect(checkNoHostPorts(containers)).toBe(false);
  });
});

describe("checkNotExternalNameService", () => {
  it("should approve undefined service specs", () => {
    const serviceSpec: V1ServiceSpec | undefined = undefined;

    expect(checkNotExternalNameService(serviceSpec)).toBe(true);
  });

  it("should approve ClusterIP services", () => {
    const serviceSpec: V1ServiceSpec = {
      type: "ClusterIP",
      ports: [],
    };

    expect(checkNotExternalNameService(serviceSpec)).toBe(true);
  });

  it("should approve LoadBalancer services", () => {
    const serviceSpec: V1ServiceSpec = {
      type: "LoadBalancer",
      ports: [],
    };

    expect(checkNotExternalNameService(serviceSpec)).toBe(true);
  });

  it("should deny ExternalName services", () => {
    const serviceSpec: V1ServiceSpec = {
      type: "ExternalName",
      externalName: "external.example.com",
      ports: [],
    };

    expect(checkNotExternalNameService(serviceSpec)).toBe(false);
  });
});

describe("checkNotNodePortService", () => {
  it("should approve undefined service specs", () => {
    const serviceSpec: V1ServiceSpec | undefined = undefined;

    expect(checkNotNodePortService(serviceSpec)).toBe(true);
  });

  it("should approve ClusterIP services", () => {
    const serviceSpec: V1ServiceSpec = {
      type: "ClusterIP",
      ports: [],
    };

    expect(checkNotNodePortService(serviceSpec)).toBe(true);
  });

  it("should approve LoadBalancer services", () => {
    const serviceSpec: V1ServiceSpec = {
      type: "LoadBalancer",
      ports: [],
    };

    expect(checkNotNodePortService(serviceSpec)).toBe(true);
  });

  it("should approve ExternalName services", () => {
    const serviceSpec: V1ServiceSpec = {
      type: "ExternalName",
      externalName: "external.example.com",
      ports: [],
    };

    expect(checkNotNodePortService(serviceSpec)).toBe(true);
  });

  it("should deny NodePort services", () => {
    const serviceSpec: V1ServiceSpec = {
      type: "NodePort",
      ports: [],
    };

    expect(checkNotNodePortService(serviceSpec)).toBe(false);
  });
});
