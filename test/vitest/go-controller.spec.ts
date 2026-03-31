/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */
import { describe, test, expect } from "vitest";
import * as k8s from "@kubernetes/client-node";

const kc = new k8s.KubeConfig();
kc.loadFromDefault();
const appsApi = kc.makeApiClient(k8s.AppsV1Api);
const customApi = kc.makeApiClient(k8s.CustomObjectsApi);

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
