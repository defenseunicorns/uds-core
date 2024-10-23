/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import * as k8s from '@kubernetes/client-node';
import * as net from 'net';

const kc = new k8s.KubeConfig();
const forward = new k8s.PortForward(kc);

kc.loadFromDefault();

export function getForward(pod: string, namespace: string, port: number) {
  return new Promise<{ server: net.Server, url: string}>((resolve, reject) => {
    const server = net.createServer((socket) => {
      forward.portForward(namespace, pod, [port], socket, null, socket);
    });

    server.listen(port, '127.0.0.1', () => {
      resolve({ server, url: `http://localhost:${port}` });
    });
  });
}

export function closeForward(server: net.Server) {
  return new Promise<void>((resolve, reject) => {
    server.close((err) => {
      if (err) {
        reject(err)
      }
      resolve();
    });
  });
}