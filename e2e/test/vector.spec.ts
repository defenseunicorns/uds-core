/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { K8s, kind } from 'kubernetes-fluent-client';
import * as net from 'net';
import { closeForward, getForward } from './forward';

const dev = process.env.DEV == 'true';
const jobName = "vector-test-log-write"

describe('Vector Test', () => {
  let vectorProxy: { server: net.Server, url: string };

  beforeAll(async () => {
    K8s(kind.Job).Apply({
      metadata: {
        name: jobName,
        namespace: "vector",
      },
      spec: {
        template: {
          metadata: {
            name: "vector-test-log-write",
            labels: {
              "zarf.dev/agent": "ignore",
              "uds.dev/test": "true"
            },  
            annotations: {
              "sidecar.istio.io/inject": "false",
            }
          },
          spec: {
            containers: [
            {
              name: "log-writer",
              image: "busybox:latest",
              command: ["sh", "-c"],
              args: ["for i in $(seq 1 20); do echo \"vector-e2e-test: Generating fake node logs...\"; echo \"$(date) log entry\" >> /var/log/test.foo; done"],
              volumeMounts: [
                {
                  name: 'var-log',
                  mountPath: '/var/log'
                }
              ]
            }
          ],
          volumes: [
            {
              name: 'var-log',
              hostPath: {
                path: '/var/log',
                type: 'Directory'
              }
            }
          ],
          restartPolicy: "Never"
        },
      },
    },
  }),
    vectorProxy = await getForward('vector', 'vector', 8686);
  })

  afterAll(async () => {
    await closeForward(vectorProxy.server)
    await K8s(kind.Job).InNamespace("vector").Delete(jobName)
    await K8s(kind.Pod).InNamespace("vector").WithLabel("uds.dev/test", "true").Delete()
  });
    // GraphQL API should be healthy
    it("GraphQL API should be healthy", async () => {
        const response = await fetch(`${vectorProxy.url}/health`)
        expect(response.status).toBe(200);
    });

    // Vector should be collecting node logs
    it("Vector should be collecting node logs", async () => {
        const requestBody = JSON.stringify({"query":"{sources(filter: {componentId:{contains:\"node_logs\"}}){nodes{metrics{receivedBytesTotal{receivedBytesTotal}}}}}"});
        const headers = {
            'Content-Type': 'application/json'
        };
        const response = await fetch(`${vectorProxy.url}/graphql`, {
          method: 'POST',
          body: requestBody,
          headers
        });
        const body = await response.json() as unknown as { data: { sources: { nodes: [{ metrics: {receivedBytesTotal: {receivedBytesTotal: number }}}]}}};
        expect(response.status).toBe(200);
        expect(body.data.sources.nodes[0].metrics.receivedBytesTotal.receivedBytesTotal).toBeGreaterThan(0);
    });

    // Vector should be collecting pod logs
    it("Vector should be collecting pod logs", async () => {
        const requestBody = JSON.stringify({ "query":"{sources(filter: {componentId:{contains:\"pod_logs\"}}){nodes{metrics{receivedBytesTotal{receivedBytesTotal}}}}}"});
        const headers = {
            'Content-Type': 'application/json'
        };
        const response = await fetch(`${vectorProxy.url}/graphql`, {
          method: 'POST',
          body: requestBody,
          headers
        });
        expect(response.status).toBe(200);
        const body = await response.json() as unknown as { data: { sources: { nodes: [{ metrics: {receivedBytesTotal: {receivedBytesTotal: number }}}]}}};
        expect(body.data.sources.nodes[0].metrics.receivedBytesTotal.receivedBytesTotal).toBeGreaterThan(0);
    });

    // Loki Host sink should be receiving node logs
    it("Loki Host sink should be receiving node logs", async () => {
        const requestBody = JSON.stringify({ "query":"{sinks(filter:{componentId:{contains:\"loki_host\"}}){nodes{metrics{receivedEventsTotal{receivedEventsTotal}}}}}"});
        const headers = {
          'Content-Type': 'application/json'
      };
      const response = await fetch(`${vectorProxy.url}/graphql`, {
        method: 'POST',
        body: requestBody,
        headers
      });
      expect(response.status).toBe(200);
      const body = await response.json() as unknown as { data: { sinks: { nodes: [{ metrics: {receivedEventsTotal: {receivedEventsTotal: number }}}]}}};
      expect(body.data.sinks.nodes[0].metrics.receivedEventsTotal.receivedEventsTotal).toBeGreaterThan(0);
   });

     // Loki Pod sink should be receiving pod logs
     it("Loki Pod sink should be receiving pod logs", async () => {
       const requestBody = JSON.stringify({ "query":"{sinks(filter:{componentId:{contains:\"loki_pod\"}}){nodes{metrics{receivedEventsTotal{receivedEventsTotal}}}}}"});
       const headers = {
         'Content-Type': 'application/json'
      };
      const response = await fetch(`${vectorProxy.url}/graphql`, {
        method: 'POST',
        body: requestBody,
        headers
      });
      expect(response.status).toBe(200);
      const body = await response.json() as unknown as { data: { sinks: { nodes: [{ metrics: {receivedEventsTotal: {receivedEventsTotal: number }}}]}}};
      expect(body.data.sinks.nodes[0].metrics.receivedEventsTotal.receivedEventsTotal).toBeGreaterThan(0);
    });

    // Vector should be able to ship logs to Loki
    it("Vector should be able to ship logs to Loki", async () => {
        const requestBody = JSON.stringify({ "query":"{sinks(filter:{componentId:{contains:\"loki_pod\"}}){nodes{metrics{sentBytesTotal{sentBytesTotal}}}}}"});
        const headers = {
          'Content-Type': 'application/json'
      };
      const response = await fetch(`${vectorProxy.url}/graphql`, {
        method: 'POST',
        body: requestBody,
        headers
      });
      expect(response.status).toBe(200);
      const body = await response.json() as unknown as { data: { sinks: { nodes: [{ metrics: {sentBytesTotal: {sentBytesTotal: number }}}]}}};
      expect(body.data.sinks.nodes[0].metrics.sentBytesTotal.sentBytesTotal).toBeGreaterThan(0);
   });
});

