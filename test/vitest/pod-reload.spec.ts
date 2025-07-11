/**
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */
import { K8s, kind } from "pepr";
import { v4 as uuidv4 } from "uuid";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

// Helper function to wait for a deployment to complete a rollout
async function waitForDeploymentRollout(
  namespace: string,
  deploymentName: string,
  initialGeneration: number,
  timeoutSeconds = 30
): Promise<{ rolledOut: boolean; currentGeneration: number }> {
  let attempts = 0;
  const maxAttempts = timeoutSeconds;

  while (attempts < maxAttempts) {
    const deployment = await K8s(kind.Deployment)
      .InNamespace(namespace)
      .Get(deploymentName);

    const observedGeneration = deployment.status?.observedGeneration;
    const currentGeneration = deployment.metadata?.generation || 0;
    const updatedReplicas = deployment.status?.updatedReplicas || 0;
    const availableReplicas = deployment.status?.availableReplicas || 0;
    const replicas = deployment.spec?.replicas || 0;

    // If initialGeneration is provided, wait for a new generation
    const isNewGeneration = currentGeneration > initialGeneration;

    // Deployment has been updated and all pods are available
    if (isNewGeneration &&
      observedGeneration === currentGeneration &&
      updatedReplicas === replicas &&
      availableReplicas === replicas) {
      return { rolledOut: true, currentGeneration };
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
    attempts++;
  }

  return { rolledOut: false, currentGeneration: 0 };
}

// Helper function to check for events
async function checkForEvents(namespace: string, options: {
  secretName: string;
  targetKind: string;
  targetName: string;
}) {
  // Wait for events to be created
  await new Promise(resolve => setTimeout(resolve, 2000));

  const events = await K8s(kind.CoreEvent)
    .InNamespace(namespace)
    .Get();

  // Check for secret change events
  const secretChangeEvents = events.items?.filter(event =>
    event.involvedObject?.kind === options.targetKind &&
    event.involvedObject?.name === options.targetName &&
    event.reason === "SecretChanged" &&
    event.message?.includes(options.secretName)
  ) || [];

  // Check for scaling events
  const scalingEvents = events.items?.filter(event =>
    event.involvedObject?.kind === options.targetKind &&
    event.involvedObject?.name === options.targetName &&
    (event.reason === "ScalingReplicaSet" || event.reason === "SuccessfulCreate")
  ) || [];

  return { secretChangeEvents, scalingEvents };
}

// Test configuration
const PODINFO_NAMESPACE = "podinfo";
const PODINFO_DEPLOYMENT = "podinfo";
const SELECTOR_SECRET_NAME = "test-selector-secret";
const AUTO_LOOKUP_SECRET_NAME = "test-auto-lookup-secret";
const TEST_DEPLOYMENT_NAME = "test-secret-consumer";

describe("Secret Auto-reload", () => {
  // Test setup and cleanup
  beforeAll(async () => {
    try {
      // Clean up any existing test resources
      try {
        await K8s(kind.Secret).InNamespace(PODINFO_NAMESPACE).Delete(SELECTOR_SECRET_NAME);
        await K8s(kind.Secret).InNamespace(PODINFO_NAMESPACE).Delete(AUTO_LOOKUP_SECRET_NAME);
        await K8s(kind.Deployment).InNamespace(PODINFO_NAMESPACE).Delete(TEST_DEPLOYMENT_NAME);
      } catch (err) {
        // Resources might not exist, continue
      }
    } catch (error) {
      console.error("Error in beforeAll:", error);
      throw error;
    }
  });

  afterAll(async () => {
    // Clean up test resources
    try {
      await K8s(kind.Secret).InNamespace(PODINFO_NAMESPACE).Delete(SELECTOR_SECRET_NAME);
      await K8s(kind.Secret).InNamespace(PODINFO_NAMESPACE).Delete(AUTO_LOOKUP_SECRET_NAME);
      await K8s(kind.Deployment).InNamespace(PODINFO_NAMESPACE).Delete(TEST_DEPLOYMENT_NAME);
    } catch (err) {
      // Ignore cleanup errors
    }
  });

  test("should restart deployment when secret has explicit selector annotation", { timeout: 30000 }, async () => {
    // Generate a unique test ID for this test run
    const testId = uuidv4().substring(0, 8);
    const testSecretName = `${SELECTOR_SECRET_NAME}-${testId}`;

    // Create a secret with explicit reload selector using the pod selector
    await K8s(kind.Secret).Create({
      metadata: {
        name: testSecretName,
        namespace: PODINFO_NAMESPACE,
        labels: {
          "uds.dev/pod-reload": "true"
        },
        annotations: {
          "uds.dev/pod-reload-selector": `app.kubernetes.io/name=podinfo`
        }
      },
      type: "Opaque",
      data: {
        "testKey": Buffer.from("initial-value").toString("base64")
      }
    });

    // Update the secret to trigger controller restart
    const newValue = uuidv4();

    // Update the secret using JSON patch format (same as controller code)
    await K8s(kind.Secret, { name: testSecretName, namespace: PODINFO_NAMESPACE }).Patch([
      {
        op: "replace",
        path: "/data/testKey",
        value: Buffer.from(newValue).toString("base64")
      }
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
      initialGeneration
    );
    expect(rolledOut).toBe(true);

    // Verify that appropriate events were created
    const { secretChangeEvents, scalingEvents } = await checkForEvents(
      PODINFO_NAMESPACE,
      {
        secretName: testSecretName,
        targetKind: "Deployment",
        targetName: PODINFO_DEPLOYMENT
      }
    );

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
  });

  test("should restart deployment using auto-lookup when pod uses secret", { timeout: 30000 }, async () => {
    // Generate a unique test ID for this test run
    const testId = uuidv4().substring(0, 8);
    const testSecretName = `${AUTO_LOOKUP_SECRET_NAME}-${testId}`;

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
          "uds.dev/pod-reload": "true"
        }
        // No uds.dev/pod-reload-selector annotation - this will force auto-lookup
      },
      type: "Opaque",
      data: {
        "testKey": Buffer.from(`initial-value-${testId}`).toString("base64")
      }
    });


    // Create a test deployment that uses this secret
    await K8s(kind.Deployment).Create({
      metadata: {
        name: TEST_DEPLOYMENT_NAME,
        namespace: PODINFO_NAMESPACE,
      },
      spec: {
        replicas: 1,
        selector: {
          matchLabels: {
            "app": TEST_DEPLOYMENT_NAME
          }
        },
        template: {
          metadata: {
            labels: {
              "app": TEST_DEPLOYMENT_NAME
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
                        name: AUTO_LOOKUP_SECRET_NAME,
                        key: "testKey"
                      }
                    }
                  }
                ],
              }
            ],
            terminationGracePeriodSeconds: 0,
            imagePullSecrets: imagePullSecrets
          }
        }
      }
    });

    // Update the auto-lookup secret to trigger controller restart
    const newValue = uuidv4();

    // Update the secret using JSON patch format (same as controller code)
    await K8s(kind.Secret, { name: testSecretName, namespace: PODINFO_NAMESPACE }).Patch([
      {
        op: "replace",
        path: "/data/testKey",
        value: Buffer.from(newValue).toString("base64")
      }
    ]);

    // Get the current test deployment generation
    const testDeployment = await K8s(kind.Deployment)
      .InNamespace(PODINFO_NAMESPACE)
      .Get(TEST_DEPLOYMENT_NAME);
    const testInitialGeneration = testDeployment.metadata!.generation!;

    // Wait for the test deployment to be restarted
    const { rolledOut } = await waitForDeploymentRollout(
      PODINFO_NAMESPACE,
      TEST_DEPLOYMENT_NAME,
      testInitialGeneration
    );
    expect(rolledOut).toBe(true);

    // Verify that appropriate events were created
    const { secretChangeEvents, scalingEvents } = await checkForEvents(
      PODINFO_NAMESPACE,
      {
        secretName: testSecretName,
        targetKind: "Deployment",
        targetName: TEST_DEPLOYMENT_NAME
      }
    );

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
    expect(scalingEvent.involvedObject?.name).toBe(TEST_DEPLOYMENT_NAME);
  });
});
