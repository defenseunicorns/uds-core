/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */
import { afterAll, describe, test, expect } from "vitest";
import * as k8s from "@kubernetes/client-node";

const kc = new k8s.KubeConfig();
kc.loadFromDefault();
const appsApi = kc.makeApiClient(k8s.AppsV1Api);
const customApi = kc.makeApiClient(k8s.CustomObjectsApi);
const coreApi = kc.makeApiClient(k8s.CoreV1Api);

const TEST_NS = "policy-tests";

describe("Go Controller", () => {
  test("uds-controller deployment should be available", async () => {
    const deployment = await appsApi.readNamespacedDeployment({
      name: "uds-controller",
      namespace: "uds-system",
    });
    expect(deployment.status?.availableReplicas).toBeGreaterThanOrEqual(1);
  });

  test("should deny deletion of ClusterConfig", async () => {
    const err = await customApi
      .deleteClusterCustomObject({
        group: "uds.dev",
        version: "v1alpha1",
        plural: "clusterconfig",
        name: "uds-cluster-config",
      })
      .catch((e: unknown) => e);

    expect(err).toBeDefined();
    expect(String(err)).toContain("Deletion of ClusterConfig is not allowed");
  });
});

describe("RequireNonRootUser Policy", () => {
  const createdPods: string[] = [];

  afterAll(async () => {
    for (const name of createdPods) {
      await coreApi
        .deleteNamespacedPod({ name, namespace: TEST_NS })
        .catch(() => {});
    }
  });

  async function createPodExpectDeny(
    name: string,
    spec: k8s.V1PodSpec,
  ): Promise<string> {
    const err = await coreApi
      .createNamespacedPod({
        namespace: TEST_NS,
        body: {
          metadata: { name, namespace: TEST_NS },
          spec,
        },
      })
      .catch((e: unknown) => e);

    return String(err);
  }

  async function createPodAndRead(
    name: string,
    spec: k8s.V1PodSpec,
    labels?: Record<string, string>,
  ): Promise<k8s.V1Pod> {
    const pod = await coreApi.createNamespacedPod({
      namespace: TEST_NS,
      body: {
        metadata: { name, namespace: TEST_NS, labels },
        spec,
      },
    });
    createdPods.push(name);
    return pod;
  }

  test("should deny container with runAsUser=0", async () => {
    const err = await createPodExpectDeny("test-root-user", {
      containers: [
        {
          name: "test",
          image: "127.0.0.1/fake",
          securityContext: { runAsUser: 0 },
        },
      ],
    });
    expect(err).toContain(
      "Containers must not run as root",
    );
  });

  test("should deny container with runAsNonRoot=false", async () => {
    const err = await createPodExpectDeny("test-non-root-false", {
      containers: [
        {
          name: "test",
          image: "127.0.0.1/fake",
          securityContext: { runAsNonRoot: false },
        },
      ],
    });
    expect(err).toContain(
      "Containers must not run as root",
    );
  });

  test("should deny pod-level runAsNonRoot=false", async () => {
    const err = await createPodExpectDeny("test-pod-root", {
      securityContext: { runAsNonRoot: false },
      containers: [
        { name: "test", image: "127.0.0.1/fake" },
      ],
    });
    expect(err).toContain(
      "Pod level securityContext does not meet the non-root user requirement",
    );
  });

  test("should deny pod-level supplementalGroups containing 0", async () => {
    const err = await createPodExpectDeny("test-supplemental-zero", {
      securityContext: { supplementalGroups: [0] },
      containers: [
        { name: "test", image: "127.0.0.1/fake" },
      ],
    });
    expect(err).toContain(
      "Pod level securityContext does not meet the non-root user requirement",
    );
  });

  test("should allow compliant pod", async () => {
    const pod = await createPodAndRead("test-compliant", {
      containers: [
        {
          name: "test",
          image: "127.0.0.1/fake",
          securityContext: { runAsNonRoot: true, runAsUser: 1000 },
        },
      ],
    });
    expect(pod.metadata?.name).toBe("test-compliant");
  });

  test("should mutate pod with default security context", async () => {
    const pod = await createPodAndRead("test-mutation-defaults", {
      containers: [
        { name: "test", image: "127.0.0.1/fake" },
      ],
    });
    expect(pod.spec?.securityContext?.runAsNonRoot).toBe(true);
    expect(pod.spec?.securityContext?.runAsUser).toBe(1000);
    expect(pod.spec?.securityContext?.runAsGroup).toBe(1000);
  });

  test("should respect uds/* label overrides in mutation", async () => {
    const pod = await createPodAndRead(
      "test-mutation-labels",
      {
        containers: [
          { name: "test", image: "127.0.0.1/fake" },
        ],
      },
      { "uds/user": "2001", "uds/group": "2002", "uds/fsgroup": "3003" },
    );
    expect(pod.spec?.securityContext?.runAsUser).toBe(2001);
    expect(pod.spec?.securityContext?.runAsGroup).toBe(2002);
    expect(pod.spec?.securityContext?.fsGroup).toBe(3003);
  });
});
