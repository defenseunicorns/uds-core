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

export async function getPodFromService(svc: string, namespace: string) {
  return new Promise<string>((resolve, reject) => {
    return K8s(kind.Service).InNamespace(namespace).Get(svc).then((service) => {
      let podsQuery = K8s(kind.Pod).InNamespace(namespace)
      const labelSelector = service.spec!.selector;
      // loop through keys in labelSelector and add them to WithLabel
      for (const key in labelSelector) {
        podsQuery = podsQuery.WithLabel(key, labelSelector[key]);
      } 

      podsQuery.Get().then((pods) => {
        if (pods.items.length == 0) {
          reject('No pods found for service');
        }
        resolve(pods.items[0].metadata!.name!);
      });
    });
  });
}

export async function getForward(service: string, namespace: string, port: number) {
  const podname = await getPodFromService(service, namespace)

  return new Promise<{ server: net.Server, url: string}>((resolve, reject) => {
    const server = net.createServer((socket) => {
      forward.portForward(namespace, podname, [port], socket, null, socket);
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
