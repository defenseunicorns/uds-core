/**
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */
import { V1ContainerStatus } from "@kubernetes/client-node";
import { K8s, kind } from "pepr";
import { v4 as uuidv4 } from "uuid";
import { afterAll, describe, expect, test } from "vitest";

// Helper function to wait on a pod to be ready matching the selector
async function waitForPodReady(
  namespace: string,
  labelSelector: Record<string, string>,
  timeoutSeconds = 30,
): Promise<void> {
  const selector = Object.entries(labelSelector)
    .map(([k, v]) => `${k}=${v}`)
    .join(",");

  let attempts = 0;
  const maxAttempts = timeoutSeconds;

  while (attempts < maxAttempts) {
    const pods = await K8s(kind.Pod).InNamespace(namespace).WithLabel(selector).Get();

    for (const pod of pods.items ?? []) {
      if (
        pod.status?.phase === "Running" &&
        (pod.status.containerStatuses ?? []).every((cs: V1ContainerStatus) => cs.ready)
      ) {
        return; // Pod is healthy!
      }
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
    attempts++;
  }
  throw new Error(
    `Timed out waiting for pod with selector ${selector} in ${namespace} to become healthy`,
  );
}

// Helper function to wait for a deployment to complete a rollout
async function waitForDeploymentRollout(
  namespace: string,
  deploymentName: string,
  initialGeneration: number,
  timeoutSeconds = 30,
): Promise<{ rolledOut: boolean; currentGeneration: number }> {
  let attempts = 0;
  const maxAttempts = timeoutSeconds;

  while (attempts < maxAttempts) {
    const deployment = await K8s(kind.Deployment).InNamespace(namespace).Get(deploymentName);

    const observedGeneration = deployment.status?.observedGeneration;
    const currentGeneration = deployment.metadata?.generation || 0;
    const available = deployment.status?.conditions?.some(
      c => c.type === "Available" && c.status === "True",
    );

    // If initialGeneration is provided, wait for a new generation
    const isNewGeneration = currentGeneration > initialGeneration;

    // Deployment has been updated and all pods are available
    if (isNewGeneration && observedGeneration === currentGeneration && available) {
      return { rolledOut: true, currentGeneration };
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
    attempts++;
  }

  return { rolledOut: false, currentGeneration: 0 };
}

// Helper function to check for events
async function checkForEvents(
  namespace: string,
  options: {
    secretName: string;
    targetKind: string;
    targetName: string;
  },
) {
  // Wait for events to be created
  await new Promise(resolve => setTimeout(resolve, 2000));

  const events = await K8s(kind.CoreEvent).InNamespace(namespace).Get();

  // Check for secret change events
  const secretChangeEvents =
    events.items?.filter(
      event =>
        event.involvedObject?.kind === options.targetKind &&
        event.involvedObject?.name === options.targetName &&
        event.reason === "SecretChanged" &&
        event.message?.includes(options.secretName),
    ) || [];

  // Check for scaling events
  const scalingEvents =
    events.items?.filter(
      event =>
        event.involvedObject?.kind === options.targetKind &&
        event.involvedObject?.name === options.targetName &&
        (event.reason === "ScalingReplicaSet" || event.reason === "SuccessfulCreate"),
    ) || [];

  return { secretChangeEvents, scalingEvents };
}

// Test configuration
const PODINFO_NAMESPACE = "podinfo";
const PODINFO_DEPLOYMENT = "podinfo";
const SELECTOR_SECRET_PREFIX = "test-selector-secret";
const AUTO_LOOKUP_SECRET_PREFIX = "test-auto-lookup-secret";
const TEST_DEPLOYMENT_PREFIX = "test-secret-consumer";

describe("Secret Auto-reload", () => {
  const createdSecrets: string[] = [];
  const createdDeployments: string[] = [];

  afterAll(async () => {
    // Tear down whatever this test created
    for (const name of createdDeployments) {
      await K8s(kind.Deployment)
        .InNamespace(PODINFO_NAMESPACE)
        .Delete(name)
        .catch(() => undefined);
    }

    for (const name of createdSecrets) {
      await K8s(kind.Secret)
        .InNamespace(PODINFO_NAMESPACE)
        .Delete(name)
        .catch(() => undefined);
    }
  });

  test(
    "should restart deployment when secret has explicit selector annotation",
    { timeout: 30000 },
    async () => {
      // Generate a unique test ID for this test run
      const testId = uuidv4().substring(0, 4);
      const testSecretName = `${SELECTOR_SECRET_PREFIX}-${testId}`;
      createdSecrets.push(testSecretName);

      // Create a secret with explicit reload selector using the pod selector
      await K8s(kind.Secret).Create({
        metadata: {
          name: testSecretName,
          namespace: PODINFO_NAMESPACE,
          labels: {
            "uds.dev/pod-reload": "true",
          },
          annotations: {
            "uds.dev/pod-reload-selector": `app.kubernetes.io/name=podinfo`,
          },
        },
        type: "Opaque",
        data: {
          testKey: Buffer.from("initial-value").toString("base64"),
        },
      });

      // Update the secret to trigger controller restart
      const newValue = uuidv4();

      // Update the secret using JSON patch format (same as controller code)
      await K8s(kind.Secret, { name: testSecretName, namespace: PODINFO_NAMESPACE }).Patch([
        {
          op: "replace",
          path: "/data/testKey",
          value: Buffer.from(newValue).toString("base64"),
        },
      ]);

      // Get the current deployment generation
      const deployment = await K8s(kind.Deployment)
        .InNamespace(PODINFO_NAMESPACE)
        .Get(PODINFO_DEPLOYMENT);
      const initialGeneration = deployment.metadata!.generation!;

      // Wait for the deployment to be restarted
      const { rolledOut } = await waitForDeploymentRollout(
        PODINFO_NAMESPACE,
        PODINFO_DEPLOYMENT,
        initialGeneration,
      );
      expect(rolledOut).toBe(true);

      // Verify that appropriate events were created
      const { secretChangeEvents, scalingEvents } = await checkForEvents(PODINFO_NAMESPACE, {
        secretName: testSecretName,
        targetKind: "Deployment",
        targetName: PODINFO_DEPLOYMENT,
      });

      // We should have both secret change events and scaling events
      expect(secretChangeEvents.length).toBeGreaterThan(0);
      expect(scalingEvents.length).toBeGreaterThan(0);

      // Verify the event properties
      const secretEvent = secretChangeEvents[0];
      expect(secretEvent.type).toBe("Normal");
      expect(secretEvent.involvedObject?.namespace).toBe(PODINFO_NAMESPACE);
      expect(secretEvent.involvedObject?.name).toBe(PODINFO_DEPLOYMENT);
      expect(secretEvent.message).toContain("Restarted due to:");
      expect(secretEvent.message).toContain(testSecretName);

      const scalingEvent = scalingEvents[0];
      expect(scalingEvent.type).toBe("Normal");
      expect(scalingEvent.involvedObject?.namespace).toBe(PODINFO_NAMESPACE);
      expect(scalingEvent.involvedObject?.name).toBe(PODINFO_DEPLOYMENT);
    },
  );

  test(
    "should restart deployment using auto-lookup when pod uses secret",
    { timeout: 30000 },
    async () => {
      // Generate a unique test ID for this test run
      const testId = uuidv4().substring(0, 4);
      const testSecretName = `${AUTO_LOOKUP_SECRET_PREFIX}-${testId}`;
      const testDeploymentName = `${TEST_DEPLOYMENT_PREFIX}-${testId}`;
      createdSecrets.push(testSecretName);
      createdDeployments.push(testDeploymentName);

      // Get the podinfo deployment to find its image and pull secrets
      const podinfoDeployment = await K8s(kind.Deployment)
        .InNamespace(PODINFO_NAMESPACE)
        .Get(PODINFO_DEPLOYMENT);

      if (!podinfoDeployment) {
        throw new Error(`Podinfo deployment not found in ${PODINFO_NAMESPACE} namespace`);
      }

      // Extract image name and pull secrets from the podinfo deployment
      const podInfoImage = podinfoDeployment.spec?.template?.spec?.containers?.[0]?.image;
      const imagePullSecrets = podinfoDeployment.spec?.template?.spec?.imagePullSecrets;

      // Create a secret WITHOUT the selector annotation - we'll rely on auto-lookup
      await K8s(kind.Secret).Create({
        metadata: {
          name: testSecretName,
          namespace: PODINFO_NAMESPACE,
          labels: {
            "uds.dev/pod-reload": "true",
          },
        },
        type: "Opaque",
        data: {
          testKey: Buffer.from(`initial-value-${testId}`).toString("base64"),
        },
      });

      // Create a test deployment that uses this secret
      await K8s(kind.Deployment).Create({
        metadata: {
          name: testDeploymentName,
          namespace: PODINFO_NAMESPACE,
        },
        spec: {
          replicas: 1,
          selector: {
            matchLabels: {
              app: testDeploymentName,
            },
          },
          template: {
            metadata: {
              labels: {
                app: testDeploymentName,
              },
            },
            spec: {
              containers: [
                {
                  name: "podinfo",
                  image: podInfoImage,
                  env: [
                    {
                      name: "TEST_SECRET_VALUE",
                      valueFrom: {
                        secretKeyRef: {
                          name: testSecretName,
                          key: "testKey",
                        },
                      },
                    },
                  ],
                },
              ],
              terminationGracePeriodSeconds: 0,
              imagePullSecrets: imagePullSecrets,
            },
          },
        },
      });

      await waitForPodReady(PODINFO_NAMESPACE, { app: testDeploymentName });

      // Update the auto-lookup secret to trigger controller restart
      const newValue = uuidv4();

      // Update the secret using JSON patch format (same as controller code)
      await K8s(kind.Secret, { name: testSecretName, namespace: PODINFO_NAMESPACE }).Patch([
        {
          op: "replace",
          path: "/data/testKey",
          value: Buffer.from(newValue).toString("base64"),
        },
      ]);

      // Get the current test deployment generation
      const testDeployment = await K8s(kind.Deployment)
        .InNamespace(PODINFO_NAMESPACE)
        .Get(testDeploymentName);
      const testInitialGeneration = testDeployment.metadata!.generation!;

      // Wait for the test deployment to be restarted
      const { rolledOut } = await waitForDeploymentRollout(
        PODINFO_NAMESPACE,
        testDeploymentName,
        testInitialGeneration,
      );
      expect(rolledOut).toBe(true);

      // Verify that appropriate events were created
      const { secretChangeEvents, scalingEvents } = await checkForEvents(PODINFO_NAMESPACE, {
        secretName: testSecretName,
        targetKind: "Deployment",
        targetName: testDeploymentName,
      });

      // We should have both secret change events and scaling events
      expect(secretChangeEvents.length).toBeGreaterThan(0);
      expect(scalingEvents.length).toBeGreaterThan(0);

      // Verify the secret change event properties
      const secretEvent = secretChangeEvents[0];
      expect(secretEvent.type).toBe("Normal");
      expect(secretEvent.involvedObject?.namespace).toBe(PODINFO_NAMESPACE);
      expect(secretEvent.message).toContain("Restarted due to:");
      expect(secretEvent.message).toContain(testSecretName);

      const scalingEvent = scalingEvents[0];
      expect(scalingEvent.type).toBe("Normal");
      expect(scalingEvent.involvedObject?.namespace).toBe(PODINFO_NAMESPACE);
      expect(scalingEvent.involvedObject?.name).toBe(testDeploymentName);
    },
  );
});
