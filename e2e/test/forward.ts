/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import * as k8s from '@kubernetes/client-node';
import { K8s, kind } from 'kubernetes-fluent-client';
import * as net from 'net';

const kc = new k8s.KubeConfig();
const forward = new k8s.PortForward(kc);

kc.loadFromDefault();

// Utility function to get an available random port within a range
async function getAvailablePort(min = 1024, max = 65535): Promise<number> {
  return new Promise((resolve, reject) => {
    const port = Math.floor(Math.random() * (max - min + 1)) + min;
    const server = net.createServer();

    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolve(port)); // If port is available, close and return it
    });

    server.on('error', () => {
      resolve(getAvailablePort(min, max)); // Retry with another port if this one is in use
    });
  });
}

export async function getPodFromService(svc: string, namespace: string): Promise<string> {
  const service = await K8s(kind.Service).InNamespace(namespace).Get(svc);
  const labelSelector = service.spec!.selector;

  let podsQuery = K8s(kind.Pod).InNamespace(namespace);
  for (const key in labelSelector) {
    podsQuery = podsQuery.WithLabel(key, labelSelector[key]);
  }

  const pods = await podsQuery.Get();
  if (pods.items.length === 0) {
    throw new Error('No pods found for service');
  }

  return pods.items[0].metadata!.name!;
}

export async function getForward(service: string, namespace: string, port: number) {
  const podname = await getPodFromService(service, namespace);
  const randomPort = await getAvailablePort(3000, 65535); // Get an available port

  return new Promise<{ server: net.Server, url: string }>((resolve, reject) => {
    const server = net.createServer((socket) => {
      forward.portForward(namespace, podname, [port], socket, null, socket);
    });

    server.listen(randomPort, '127.0.0.1', () => {
      resolve({ server, url: `http://localhost:${randomPort}` });
    });

    server.on('error', (err) => {
      reject(`Error binding to port ${randomPort}: ${err.message}`);
    });
  });
}

export function closeForward(server: net.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}
