/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import * as k8s from "@kubernetes/client-node";
import { K8s, kind } from "kubernetes-fluent-client";
import * as net from "net";

const kc = new k8s.KubeConfig();
kc.loadFromDefault();

// Fail fast if kubeconfig cannot be loaded or no context is set
if (!kc.getCurrentContext()) {
  throw new Error(
    "No current Kubernetes context found. Ensure KUBECONFIG is set or in-cluster config is available.",
  );
}

const forward = new k8s.PortForward(kc);

interface ForwardResult {
  server: net.Server;
  url: string;
}

export async function getPodFromService(svc: string, namespace: string): Promise<string> {
  try {
    const service = await K8s(kind.Service).InNamespace(namespace).Get(svc);
    const labelSelector = service.spec?.selector;

    if (!labelSelector) {
      throw new Error(`No label selectors found for service: ${svc}`);
    }

    let podsQuery = K8s(kind.Pod).InNamespace(namespace);
    for (const key in labelSelector) {
      podsQuery = podsQuery.WithLabel(key, labelSelector[key]);
    }

    const pods = await podsQuery.Get();
    if (pods.items.length === 0) {
      throw new Error(`No pods found for service: ${svc}`);
    }

    return pods.items[0].metadata!.name!;
  } catch (err) {
    // Type guard to check if `err` is an instance of `Error`
    if (err instanceof Error) {
      throw new Error(`Failed to get pod from service ${svc}: ${err.message}`);
    } else {
      throw new Error(`Unknown error occurred while fetching pod from service ${svc}`);
    }
  }
}

export async function getForward(
  service: string,
  namespace: string,
  port: number,
): Promise<ForwardResult> {
  try {
    const podName = await getPodFromService(service, namespace);

    return await new Promise<ForwardResult>((resolve, reject) => {
      const server = net.createServer(socket => {
        // Surface port-forward setup errors on the socket so callers can see failures quickly
        void forward.portForward(namespace, podName, [port], socket, null, socket).catch(err => {
          socket.destroy(err instanceof Error ? err : new Error(String(err)));
        });
      });

      server.on("error", err => {
        if (err instanceof Error) {
          reject(new Error(`Error binding to local port for forward: ${err.message}`));
        } else {
          reject(new Error("Unknown error occurred while binding local port for forward"));
        }
      });

      // Allow the OS to automatically select a port
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        if (
          !address ||
          typeof address !== "object" ||
          address.address === undefined ||
          address.port === undefined
        ) {
          reject(new Error("Failed to determine local port for forward"));
          server.close();
          return;
        }

        const localPort = address.port;
        // Allow the process to exit even if the server is still open (tests should close it explicitly)
        server.unref();
        resolve({ server, url: `http://localhost:${localPort}` });
      });
    });
  } catch (err) {
    if (err instanceof Error) {
      throw new Error(`Failed to setup port forwarding for service ${service}: ${err.message}`);
    } else {
      throw new Error(
        `Unknown error occurred while setting up port forwarding for service ${service}`,
      );
    }
  }
}

export function closeForward(server: net.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close(err => {
      // Type guard to check if `err` is an instance of `Error`
      if (err instanceof Error) {
        reject(new Error(`Failed to close server: ${err.message}`));
      } else if (err) {
        reject(new Error("Unknown error occurred while closing the server"));
      } else {
        resolve();
      }
    });
  });
}
