/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import * as k8s from "@kubernetes/client-node";

const kc = new k8s.KubeConfig();
kc.loadFromDefault();
const core = kc.makeApiClient(k8s.CoreV1Api);

export async function getPodLogs(
  namespace: string,
  podName: string,
  containerName?: string,
): Promise<string[]> {
  const logs = await core.readNamespacedPodLog({
    name: podName,
    namespace: namespace,
    container: containerName,
  });

  // logs is a string, so split into lines and filter out any trailing empty line
  return logs.split("\n").filter(line => line.length > 0);
}

export async function getAllLogsByLabelSelector(
  namespace: string,
  labelSelector: string,
  containerName?: string,
): Promise<string[]> {
  // Get all pods matching the label selector
  const podsResponse = await core.listNamespacedPod({
    namespace: namespace,
    labelSelector: labelSelector,
  });

  const allLogs: string[] = [];

  // Get logs from each pod
  for (const pod of podsResponse.items) {
    if (pod.metadata?.name) {
      const podLogs = await getPodLogs(namespace, pod.metadata.name, containerName);
      allLogs.push(...podLogs);
    }
  }

  return allLogs;
}
