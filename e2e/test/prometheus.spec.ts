/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import * as net from 'net';
import { closeForward, getForward } from './forward';

const dev = process.env.DEV == 'true';

describe('Prometheus and Alertmanager', () => {
  let prometheusProxy: { server: net.Server, url: string };
  let alertmanagerProxy: { server: net.Server, url: string };

  beforeAll(async () => {
    prometheusProxy = await getForward('kube-prometheus-stack-prometheus', 'monitoring', 9090);
    alertmanagerProxy  = await getForward('kube-prometheus-stack-alertmanager', 'monitoring', 9093);
  })

  afterAll(async () => {
    await closeForward(prometheusProxy.server)
    await closeForward(alertmanagerProxy.server)
  });
  
  it('alert manager service should be responsive via the internal service address', async () => {
    const response = await fetch(`${alertmanagerProxy.url}`);
    expect(response.status).toBe(200);
  });

  it('alert manager should be firing watchdog alert', async () => {
    // fetch active alerts with alertname="Watchdog"
    const response = await fetch(`${alertmanagerProxy.url}/api/v2/alerts/groups?filter=alertname%3D%22Watchdog%22&silenced=false&inhibited=false&active=true`);
    expect(response.status).toBe(200);

    const body = await response.json() as unknown as [{ alerts: { status: { state: string } }[] }];
    expect(body[0]).toBeDefined();
    expect(body[0].alerts[0].status.state).toEqual('active');
  });

  it('prometheus web ui should be responsive via the internal service address', async () => {
    const response = await fetch(`${prometheusProxy.url}`);
    expect(response.status).toBe(200);
  });

  it('all prometheus targets should be up', async () => {
    const response = await fetch(`${prometheusProxy.url}/api/v1/targets`);
    expect(response.status).toBe(200);

    const body = await response.json() as unknown as { data: { activeTargets: any[] } };
    expect(body.data).toBeDefined();
    expect(body.data.activeTargets.length).toBeGreaterThan(0);

    // filter out unknown because test runner pod is unknown, probably can filter out specific pod
    const failedTargets = body.data.activeTargets.filter(target => target.health !== 'up' && target.health !== 'unknown');

    expect(failedTargets).toEqual([]);
  });
});