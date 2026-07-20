/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import * as k8s from "@kubernetes/client-node";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { pollUntilSuccess } from "./helpers/polling";

// hookTimeout must exceed waitForNamespaceDeleted's own timeout below.
vi.setConfig({ hookTimeout: 270000, testTimeout: 180000 });

const TEST_NAMESPACE = "envoy-gateway-e2e";
const GATEWAY_NAME = "uds-core-eg-e2e";
const OWNING_GATEWAY_LABEL = "gateway.envoyproxy.io/owning-gateway-name";

const kc = new k8s.KubeConfig();
kc.loadFromDefault();

const core = kc.makeApiClient(k8s.CoreV1Api);
const customObjects = kc.makeApiClient(k8s.CustomObjectsApi);

type Condition = {
  type?: string;
  status?: string;
  reason?: string;
  message?: string;
};

type GatewayObject = k8s.KubernetesObject & {
  status?: {
    conditions?: Condition[];
  };
};

function isConflict(error: unknown): boolean {
  return error instanceof k8s.ApiException && error.code === 409;
}

function isNotFound(error: unknown): boolean {
  return error instanceof k8s.ApiException && error.code === 404;
}

async function createNamespace(): Promise<void> {
  try {
    await core.createNamespace({
      body: {
        metadata: {
          name: TEST_NAMESPACE,
          labels: {
            "app.kubernetes.io/name": "envoy-gateway-e2e",
            // Required for the proxy to complete xDS mTLS with the controller.
            "istio.io/dataplane-mode": "ambient",
          },
        },
      },
    });
  } catch (error) {
    if (!isConflict(error)) throw error;
  }

  await copyPrivateRegistrySecret();
}

// Mirrors the "private-registry" secret Zarf provisions automatically for
// namespaces it creates, needed here since this namespace is created directly.
async function copyPrivateRegistrySecret(): Promise<void> {
  const source = await core.readNamespacedSecret({ name: "private-registry", namespace: "zarf" });

  try {
    await core.createNamespacedSecret({
      namespace: TEST_NAMESPACE,
      body: {
        metadata: { name: "private-registry" },
        type: source.type,
        data: source.data,
      },
    });
  } catch (error) {
    if (!isConflict(error)) throw error;
  }
}

async function deleteNamespace(): Promise<void> {
  try {
    await core.deleteNamespace({ name: TEST_NAMESPACE });
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
}

async function waitForNamespaceDeleted(): Promise<void> {
  await pollUntilSuccess(
    async () => {
      try {
        await core.readNamespace({ name: TEST_NAMESPACE });
        return false;
      } catch (error) {
        if (isNotFound(error)) return true;
        throw error;
      }
    },
    deleted => deleted,
    // Measured 117-159s on a busy cluster (cascading cleanup competing with everything
    // else deploying concurrently), so 120s isn't enough; 240s gives real margin.
    `namespace ${TEST_NAMESPACE} deleted`,
    240000,
    5000,
  );
}

async function createGateway(): Promise<void> {
  await customObjects.createNamespacedCustomObject({
    group: "gateway.networking.k8s.io",
    version: "v1",
    namespace: TEST_NAMESPACE,
    plural: "gateways",
    body: {
      apiVersion: "gateway.networking.k8s.io/v1",
      kind: "Gateway",
      metadata: {
        name: GATEWAY_NAME,
      },
      spec: {
        gatewayClassName: "envoy-gateway",
        listeners: [
          {
            name: "udp-7777",
            protocol: "UDP",
            port: 7777,
          },
        ],
      },
    },
  });
}

async function readGateway(): Promise<GatewayObject> {
  return (await customObjects.getNamespacedCustomObject({
    group: "gateway.networking.k8s.io",
    version: "v1",
    namespace: TEST_NAMESPACE,
    plural: "gateways",
    name: GATEWAY_NAME,
  })) as GatewayObject;
}

function hasAcceptedCondition(gateway: GatewayObject): boolean {
  return (
    gateway.status?.conditions?.some(
      condition => condition.type === "Accepted" && condition.status === "True",
    ) ?? false
  );
}

async function listManagedPods(): Promise<k8s.V1Pod[]> {
  const pods = await core.listPodForAllNamespaces({
    labelSelector: `${OWNING_GATEWAY_LABEL}=${GATEWAY_NAME}`,
  });

  return pods.items;
}

async function listManagedServices(): Promise<k8s.V1Service[]> {
  const services = await core.listServiceForAllNamespaces({
    labelSelector: `${OWNING_GATEWAY_LABEL}=${GATEWAY_NAME}`,
  });

  return services.items;
}

function isPodReady(pod: k8s.V1Pod): boolean {
  return (
    pod.status?.conditions?.some(
      condition => condition.type === "Ready" && condition.status === "True",
    ) ?? false
  );
}

describe("Envoy Gateway", () => {
  beforeAll(async () => {
    await deleteNamespace();
    await waitForNamespaceDeleted();
    await createNamespace();
    await createGateway();
  });

  afterAll(async () => {
    await deleteNamespace();
    await waitForNamespaceDeleted();
  });

  test("reconciles a UDP Gateway into managed Envoy infrastructure", async () => {
    const gateway = await pollUntilSuccess(
      readGateway,
      hasAcceptedCondition,
      `Gateway ${TEST_NAMESPACE}/${GATEWAY_NAME} accepted`,
      120000,
      5000,
    );

    expect(hasAcceptedCondition(gateway)).toBe(true);

    const services = await pollUntilSuccess(
      listManagedServices,
      items => items.length > 0,
      `managed Envoy Service for Gateway ${GATEWAY_NAME}`,
      120000,
      5000,
    );

    expect(services.length).toBeGreaterThan(0);

    const pods = await pollUntilSuccess(
      listManagedPods,
      items => items.some(isPodReady),
      `ready managed Envoy pod for Gateway ${GATEWAY_NAME}`,
      120000,
      5000,
    );

    expect(pods.some(isPodReady)).toBe(true);
  });
});
