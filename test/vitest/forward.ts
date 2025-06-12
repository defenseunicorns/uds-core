/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import * as k8s from "@kubernetes/client-node";
import { K8s, kind } from "kubernetes-fluent-client";
import * as net from "net";

const kc = new k8s.KubeConfig();
const forward = new k8s.PortForward(kc);
kc.loadFromDefault();

interface ForwardResult {
  server: net.Server;
  url: string;
}

// Utility function to get an available random port within a range
async function getAvailablePort(min = 1024, max = 65535): Promise<number> {
  let port: number;
  let isAvailable = false;

  while (!isAvailable) {
    port = Math.floor(Math.random() * (max - min + 1)) + min;
    isAvailable = await new Promise<boolean>(resolve => {
      const server = net.createServer();

      server.once("error", () => resolve(false)); // Port is in use
      server.once("listening", () => {
        server.close(() => resolve(true)); // Port is available
      });

      server.listen(port, "127.0.0.1");
    });
  }

  return port!;
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
    const randomPort = await getAvailablePort(3000, 65535);

    return await new Promise<ForwardResult>((resolve, reject) => {
      const server = net.createServer(socket => {
        // Explicitly ignore the promise with `void` to avoid eslint no-floating-promises error
        void forward.portForward(namespace, podName, [port], socket, null, socket);
      });

      server.listen(randomPort, "127.0.0.1", () => {
        resolve({ server, url: `http://localhost:${randomPort}` });
      });

      server.on("error", err => {
        if (err instanceof Error) {
          reject(new Error(`Error binding to port ${randomPort}: ${err.message}`));
        } else {
          reject(new Error(`Unknown error occurred while binding to port ${randomPort}`));
        }
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
