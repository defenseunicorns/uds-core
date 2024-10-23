/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { expect, it, jest } from "@jest/globals";
import { describe } from "node:test";


const dev = process.env.DEV == 'true';

let PROMETHEUS_URL = 'http://kube-prometheus-stack-prometheus.monitoring.svc.cluster.local:9090';
let ALERTMANAGER_URL = 'http://kube-prometheus-stack-alertmanager.monitoring.svc.cluster.local:9093';

if (dev == true) {
  ALERTMANAGER_URL = 'http://localhost:9093';
  PROMETHEUS_URL = 'http://localhost:9090';
}

describe('Prometheus and Alertmanager', () => {
  jest.retryTimes(3);
  
  it('alert manager service should be responsive via the internal service address', async () => {
    const response = await fetch(`${ALERTMANAGER_URL}`);
    expect(response.status).toBe(200);
  });

  it('alert manager should be firing watchdog alert', async () => {
    // fetch active alerts with alertname="Watchdog"
    const response = await fetch(`${ALERTMANAGER_URL}/api/v2/alerts/groups?filter=alertname%3D%22Watchdog%22&silenced=false&inhibited=false&active=true`);
    expect(response.status).toBe(200);

    const body = await response.json() as unknown as [{ alerts: { status: { state: string } }[] }];
    expect(body[0]).toBeDefined();
    expect(body[0].alerts[0].status.state).toEqual('active');
  });

  it('prometheus web ui should be responsive via the internal service address', async () => {
    const response = await fetch(`${PROMETHEUS_URL}`);
    expect(response.status).toBe(200);
  });

  it('all prometheus targets should be up', async () => {
    const response = await fetch(`${PROMETHEUS_URL}/api/v1/targets`);
    expect(response.status).toBe(200);

    const body = await response.json() as unknown as { data: { activeTargets: any[] } };
    expect(body.data).toBeDefined();
    expect(body.data.activeTargets.length).toBeGreaterThan(0);

    const failedTargets = body.data.activeTargets.filter(target => target.health !== 'up');

    expect(failedTargets).toEqual([]);
  });
});