/**
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */
import { describe, test } from "@jest/globals";
import * as k8s from "@kubernetes/client-node";
import fetch from 'node-fetch';

const kc = new k8s.KubeConfig();
kc.loadFromDefault();

interface KubeConfigCerts {
  caCert?: string;
  cert?: string;
  key?: string;
}

function getApiServerAddress(): string | undefined {
    try {
      const currentContext = kc.getCurrentContext();
      const context = kc.getContextObject(currentContext);
      if (!context) {
        throw new Error(`Context "${currentContext}" not found in kubeconfig`);
        return undefined;
      }
      const clusterName = context.cluster;
      const cluster = kc.getCluster(clusterName);
      if (!cluster) {
        throw new Error(`Cluster "${clusterName}" not found in kubeconfig`);
        return undefined;
      }
      return cluster.server;
    } catch (err) {
      throw new Error('Error getting API server address:');
      return undefined;
    }
  }

function getCertsFromKubeConfig(): KubeConfigCerts | undefined {
    try {
      const currentContext = kc.getCurrentContext();
      const context = kc.getContextObject(currentContext);
      if (!context) {
        throw new Error(`Context "${currentContext}" not found in kubeconfig`);
        return undefined;
      }
      const clusterName = context.cluster;
      const cluster = kc.getCluster(clusterName)
      const user = kc.getCurrentUser()
      if (!cluster) {
        throw new Error(`Cluster "${clusterName}" not found in kubeconfig`);
        return undefined;
      }
      const caCert = cluster?.caData || "";
      const cert = user?.certData || ""
      const key = user?.keyData || ""
      return { caCert, cert, key };
    } catch (err) {
      throw new Error('Error getting certs from kubeconfig:');
      return undefined;
    }
  }

describe("Metrics Server", () => {
    const apiServerAddress = getApiServerAddress();
    const certs = getCertsFromKubeConfig() || {};
    const metricsApi = "/apis/metrics.k8s.io/v1beta1";
    const https = require('https');
    if (!apiServerAddress) {
        throw new Error("API server address not found.");
        return;
    }
    if (!certs) {
      throw new Error("Cluster certificates could not be loaded.");
      return;
    }
    const decodedCerts = {
      caCert: Buffer.from(certs.caCert || "", 'base64').toString('utf-8'),
      cert: Buffer.from(certs.cert || "", 'base64').toString('utf-8'),
      key: Buffer.from(certs.key || "", 'base64').toString('utf-8'),
    };
    const agent = new https.Agent({
        cert: decodedCerts.cert,
        key: decodedCerts.key,
        ca: decodedCerts.caCert
    });
    test("metrics-server should return node metrics", async () => {
        const response = await fetch(`${apiServerAddress}${metricsApi}/nodes`, {
            agent: agent,
        });
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.kind).toBe("NodeMetricsList");
        expect(body.items).toBeDefined();
        expect(body.items.length).toBeGreaterThan(0);
    });
    test("metrics-server should return pod metrics", async () => {
        const response = await fetch(`${apiServerAddress}${metricsApi}/pods`, {
            agent: agent,
        });
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.kind).toBe("PodMetricsList");
        expect(body.items).toBeDefined();
        expect(body.items.length).toBeGreaterThan(0);
    });

});
