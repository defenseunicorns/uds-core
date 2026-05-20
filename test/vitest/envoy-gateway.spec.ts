/**
 * Copyright 2024-2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */
import * as k8s from "@kubernetes/client-node";
import { K8s, kind } from "kubernetes-fluent-client";
import { describe, expect, test } from "vitest";

const kc = new k8s.KubeConfig();
kc.loadFromDefault();
const customObjects = kc.makeApiClient(k8s.CustomObjectsApi);

describe("Envoy Gateway", () => {
  test("controller deployment should be available", async () => {
    const deployment = await K8s(kind.Deployment).InNamespace("envoy-gateway-system").Get("envoy-gateway");
    const available = deployment.status?.conditions?.find(c => c.type === "Available");
    expect(available?.status).toBe("True");
  });

  test("GatewayClass envoy-gateway should be accepted", async () => {
    const res = await customObjects.getClusterCustomObject({ group: "gateway.networking.k8s.io", version: "v1", plural: "gatewayclasses", name: "envoy-gateway" });
    const gatewayClass = res as { status?: { conditions?: Array<{ type: string; status: string }> } };
    const accepted = gatewayClass.status?.conditions?.find(c => c.type === "Accepted");
    expect(accepted?.status).toBe("True");
  });
});
