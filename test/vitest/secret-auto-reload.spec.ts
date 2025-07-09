/**
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */
import { K8s, kind } from "pepr";
import { v4 as uuidv4 } from "uuid";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

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

  // Check for scaling events (which happen when pods are recreated)
  const scalingEvents = events.items?.filter(event =>
    event.involvedObject?.kind === "ReplicaSet" &&
    event.involvedObject?.name?.startsWith(`${options.targetName}-`) &&
    event.reason === "ScalingReplicaSet"
  ) || [];

  return {
    secretChangeEvents,
    scalingEvents,
    hasRequiredEvents: secretChangeEvents.length > 0 || scalingEvents.length > 0
  };
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

      // Wait to ensure cleanup is complete
      await new Promise(resolve => setTimeout(resolve, 1000));

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

  test("should restart deployment when secret has explicit selector annotation", { timeout: 60000 }, async () => {

    // Get the podinfo deployment to find its selector labels
    const podinfoDeployment = await K8s(kind.Deployment)
      .InNamespace(PODINFO_NAMESPACE)
      .Get(PODINFO_DEPLOYMENT);

    if (!podinfoDeployment) {
      throw new Error(`Podinfo deployment not found in ${PODINFO_NAMESPACE} namespace`);
    }

    // Get the selector labels from the deployment
    const selectorLabels = podinfoDeployment.spec?.selector?.matchLabels || {};
    const selectorKey = Object.keys(selectorLabels)[0] || "app";
    const selectorValue = selectorLabels[selectorKey] || PODINFO_DEPLOYMENT;


    // Create a secret with explicit reload selector using the pod selector
    await K8s(kind.Secret).Create({
      metadata: {
        name: SELECTOR_SECRET_NAME,
        namespace: PODINFO_NAMESPACE,
        labels: {
          "uds.dev/pod-reload": "true"
        },
        annotations: {
          // This is the key part: we're using an explicit selector to target the podinfo pods
          "uds.dev/pod-reload-selector": `${selectorKey}=${selectorValue}`
        }
      },
      type: "Opaque",
      data: {
        "testKey": Buffer.from("initial-value").toString("base64")
      }
    });


    // Wait for resource creation to be fully registered
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Get initial deployment state
    const initialDeployment = await K8s(kind.Deployment)
      .InNamespace(PODINFO_NAMESPACE)
      .Get(PODINFO_DEPLOYMENT);

    if (!initialDeployment) {
      throw new Error(`Podinfo deployment not found after secret creation`);
    }

    // Remove managedFields to avoid issues with future operations
    if (initialDeployment.metadata) {
      delete initialDeployment.metadata.managedFields;
    }

    const initialRestartTimestamp = initialDeployment.spec?.template?.metadata?.annotations?.["uds.dev/restartedAt"];

    // Update the secret to trigger controller restart
    const newValue = uuidv4();

    // Update the secret using JSON patch format (same as controller code)
    await K8s(kind.Secret, { name: SELECTOR_SECRET_NAME, namespace: PODINFO_NAMESPACE }).Patch([
      {
        op: "replace",
        path: "/data/testKey",
        value: Buffer.from(newValue).toString("base64")
      }
    ]);


    // Wait for the deployment to be restarted
    let updatedDeployment;
    let attempts = 0;
    const maxAttempts = 30; // 30 seconds timeout
    let restartConfirmed = false;

    while (attempts < maxAttempts && !restartConfirmed) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      updatedDeployment = await K8s(kind.Deployment)
        .InNamespace(PODINFO_NAMESPACE)
        .Get(PODINFO_DEPLOYMENT);

      const newRestartTimestamp = updatedDeployment.spec?.template?.metadata?.annotations?.["uds.dev/restartedAt"];

      if (newRestartTimestamp && newRestartTimestamp !== initialRestartTimestamp) {
        restartConfirmed = true;
      } else {
        ++attempts;
      }
    }

    expect(restartConfirmed).toBe(true);
    expect(updatedDeployment?.spec?.template?.metadata?.annotations?.["uds.dev/restartedAt"])
      .not.toEqual(initialRestartTimestamp);

    // Verify that appropriate events were created
    const { secretChangeEvents, scalingEvents, hasRequiredEvents } = await checkForEvents(
      PODINFO_NAMESPACE,
      {
        secretName: SELECTOR_SECRET_NAME,
        targetKind: "Deployment",
        targetName: PODINFO_DEPLOYMENT
      }
    );

    // We should have either a secret change event or scaling events
    expect(hasRequiredEvents).toBe(true);

    // If we have secret change events, verify their properties
    if (secretChangeEvents.length > 0) {
      const event = secretChangeEvents[0];
      expect(event.type).toBe("Normal");
      expect(event.involvedObject?.namespace).toBe(PODINFO_NAMESPACE);
      expect(event.message).toContain("Restarted due to:");
    }

    // If we have scaling events, verify they're for our deployment
    if (scalingEvents.length > 0) {
      const event = scalingEvents[0];
      expect(event.type).toBe("Normal");
      expect(event.involvedObject?.namespace).toBe(PODINFO_NAMESPACE);
    }
  });

  test("should restart deployment using auto-lookup when pod uses secret", { timeout: 60000 }, async () => {

    // Get the podinfo deployment to find its image and pull secrets
    const podinfoDeployment = await K8s(kind.Deployment)
      .InNamespace(PODINFO_NAMESPACE)
      .Get(PODINFO_DEPLOYMENT);

    if (!podinfoDeployment) {
      throw new Error(`Podinfo deployment not found in ${PODINFO_NAMESPACE} namespace`);
    }

    // Extract image name and pull secrets from the podinfo deployment
    const podInfoImage = podinfoDeployment.spec?.template?.spec?.containers?.[0]?.image || "podinfo:latest";
    const imagePullSecrets = podinfoDeployment.spec?.template?.spec?.imagePullSecrets || [];


    // Create a secret WITHOUT the selector annotation - we'll rely on auto-lookup
    await K8s(kind.Secret).Create({
      metadata: {
        name: AUTO_LOOKUP_SECRET_NAME,
        namespace: PODINFO_NAMESPACE,
        labels: {
          "uds.dev/pod-reload": "true"
        }
        // No uds.dev/pod-reload-selector annotation - this will force auto-lookup
      },
      type: "Opaque",
      data: {
        "testKey": Buffer.from("initial-value").toString("base64")
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
            // Add initial annotations to ensure the patch operation works
            annotations: {
              "uds.dev/initialTimestamp": new Date().toISOString()
            }
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
                // Also mount the secret as a volume to ensure it's detected
                volumeMounts: [
                  {
                    name: "test-secret-volume",
                    mountPath: "/etc/test-secret",
                    readOnly: true
                  }
                ]
              }
            ],
            volumes: [
              {
                name: "test-secret-volume",
                secret: {
                  secretName: AUTO_LOOKUP_SECRET_NAME
                }
              }
            ],
            terminationGracePeriodSeconds: 0,
            imagePullSecrets: imagePullSecrets
          }
        }
      }
    });


    // Wait for resources to be fully created and registered
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Verify the deployment is consuming the secret correctly
    const testDeployment = await K8s(kind.Deployment)
      .InNamespace(PODINFO_NAMESPACE)
      .Get(TEST_DEPLOYMENT_NAME);


    // Wait for pods to be ready
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Get initial test deployment state
    const initialTestDeployment = await K8s(kind.Deployment)
      .InNamespace(PODINFO_NAMESPACE)
      .Get(TEST_DEPLOYMENT_NAME);

    // Remove managedFields to avoid issues with future operations
    if (initialTestDeployment.metadata) {
      delete initialTestDeployment.metadata.managedFields;
    }

    const initialRestartTimestamp = initialTestDeployment.spec?.template?.metadata?.annotations?.["uds.dev/restartedAt"];

    // Update the auto-lookup secret to trigger controller restart
    const newValue = uuidv4();

    // Check if the controller is watching for the right secrets
    const secretBeforeUpdate = await K8s(kind.Secret)
      .InNamespace(PODINFO_NAMESPACE)
      .Get(AUTO_LOOKUP_SECRET_NAME);


    // Update the secret using JSON patch format (same as controller code)
    await K8s(kind.Secret, { name: AUTO_LOOKUP_SECRET_NAME, namespace: PODINFO_NAMESPACE }).Patch([
      {
        op: "replace",
        path: "/data/testKey",
        value: Buffer.from(newValue).toString("base64")
      }
    ]);


    // Wait for the test deployment to be restarted or pods to be evicted
    let attempts = 0;
    const maxAttempts = 30; // 30 seconds timeout
    let restartConfirmed = false;

    // Get initial pod list to compare later
    const initialPods = await K8s(kind.Pod)
      .InNamespace(PODINFO_NAMESPACE)
      .WithLabel("app", TEST_DEPLOYMENT_NAME)
      .Get();

    const initialPodNames = initialPods.items.map(pod => pod.metadata?.name).filter(Boolean);

    while (attempts < maxAttempts && !restartConfirmed) {
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Check if deployment was restarted via annotation
      const updatedTestDeployment = await K8s(kind.Deployment)
        .InNamespace(PODINFO_NAMESPACE)
        .Get(TEST_DEPLOYMENT_NAME);

      const newRestartTimestamp = updatedTestDeployment.spec?.template?.metadata?.annotations?.["uds.dev/restartedAt"];

      if (newRestartTimestamp && newRestartTimestamp !== initialRestartTimestamp) {
        restartConfirmed = true;
        continue;
      }

      // Check if pods were evicted/replaced
      const currentPods = await K8s(kind.Pod)
        .InNamespace(PODINFO_NAMESPACE)
        .WithLabel("app", TEST_DEPLOYMENT_NAME)
        .Get();

      const currentPodNames = currentPods.items.map(pod => pod.metadata?.name).filter(Boolean);

      // Check if pods have changed (evicted and replaced)
      const podsChanged = initialPodNames.some(name => !currentPodNames.includes(name)) ||
        currentPodNames.some(name => !initialPodNames.includes(name));

      if (podsChanged) {
        restartConfirmed = true;
        continue;
      }

      ++attempts;
    }

    // Test deployment should have been restarted or pods evicted after secret update
    expect(restartConfirmed).toBe(true);

    // Verify that appropriate events were created
    const { secretChangeEvents, scalingEvents, hasRequiredEvents } = await checkForEvents(
      PODINFO_NAMESPACE,
      {
        secretName: AUTO_LOOKUP_SECRET_NAME,
        targetKind: "Deployment",
        targetName: TEST_DEPLOYMENT_NAME
      }
    );

    // We should have either a secret change event or scaling events
    expect(hasRequiredEvents).toBe(true);

    // Check for pod eviction events as a fallback
    if (!hasRequiredEvents) {
      const podEvents = await K8s(kind.CoreEvent)
        .InNamespace(PODINFO_NAMESPACE)
        .Get();

      const podEvictionEvents = podEvents.items?.filter(event =>
        event.involvedObject?.kind === "Pod" &&
        event.involvedObject?.name?.startsWith(`${TEST_DEPLOYMENT_NAME}-`) &&
        event.message?.includes(AUTO_LOOKUP_SECRET_NAME)
      ) || [];

      // Should have pod eviction events as fallback
      expect(podEvictionEvents.length).toBeGreaterThan(0);
    }
  });
});
