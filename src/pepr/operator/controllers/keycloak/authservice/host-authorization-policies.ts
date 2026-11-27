/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */
import { IstioAction, IstioAuthorizationPolicy } from "../../../crd";
import { PROMETHEUS_PRINCIPAL } from "../../utils";
import { buildMonitorOperations, MonitorExemption } from "../../monitoring/monitor-exemptions";
import { machineHeader } from "./host-authentication-policies";

const channelMetadataKey = "experimental.envoy.filters.http.lua[uds_authservice_channel]";

export function buildAuthorizationPolicies(
  issuer: string,
  clientId: string,
  hosts: string[],
  machines: { clientId: string; subject: string }[],
  gatewayNamespace: string,
  isSidecar: boolean,
  monitorExemptions: MonitorExemption[],
) {
  const to = [{ operation: { hosts } }];
  // Read the original token location before JWT authentication consumes the reserved header.
  const machineHeaderPresent = { key: `request.headers[${machineHeader}]`, values: ["*"] };
  const machineChannel = { key: channelMetadataKey, values: ["machine"] };
  const wrongIssuer = { key: "request.auth.claims[iss]", notValues: [issuer] };
  const wrongAudience = { key: "request.auth.audiences", notValues: [clientId] };
  const presenter = "request.auth.presenter";
  const invalidMachineClaims = [
    wrongIssuer,
    wrongAudience,
    { key: presenter, notValues: machines.map(m => m.clientId) },
  ];
  // Deny mismatched pairs even when both identities are individually approved.
  const buildMachineDenials = (sourceCondition: typeof machineHeaderPresent) => {
    if (machines.length === 0) return [{ to, when: [sourceCondition] }];
    return [
      ...invalidMachineClaims.map(claim => ({ to, when: [sourceCondition, claim] })),
      ...machines.map(machine => ({
        to,
        when: [
          sourceCondition,
          { key: presenter, values: [machine.clientId] },
          { key: "request.auth.claims[sub]", notValues: [machine.subject] },
        ],
      })),
    ];
  };
  const browser: NonNullable<IstioAuthorizationPolicy["spec"]> = {
    action: IstioAction.Custom,
    provider: { name: "authservice" },
    rules: [{ to, when: [{ key: machineHeaderPresent.key, notValues: ["*"] }] }],
  };
  const ingress: NonNullable<IstioAuthorizationPolicy["spec"]> = {
    action: IstioAction.Deny,
    rules: buildMachineDenials(machineHeaderPresent),
  };
  const workload: NonNullable<IstioAuthorizationPolicy["spec"]> = {
    action: IstioAction.Deny,
    rules: [
      { to: [{ operation: { notHosts: hosts } }] },
      {
        from: [
          {
            source: {
              notPrincipals: [`cluster.local/ns/${gatewayNamespace}/sa/tenant-ingressgateway`],
            },
          },
        ],
      },
      { when: [wrongAudience] },
      { when: [wrongIssuer] },
      { when: [{ key: channelMetadataKey, notValues: ["browser", "machine"] }] },
      {
        when: [
          { key: channelMetadataKey, values: ["browser"] },
          { key: presenter, notValues: [clientId] },
        ],
      },
      ...buildMachineDenials(machineChannel),
    ],
  };
  const { nonMetrics } = buildMonitorOperations([
    ...monitorExemptions,
    ...(isSidecar ? [{ port: "15020", path: "/stats/prometheus" }] : []),
  ]);
  if (nonMetrics.length) {
    // Exempt only Prometheus on configured endpoints; every other caller keeps all denials.
    for (const rule of workload.rules!) {
      rule.when = [
        ...(rule.when ?? []),
        { key: "source.principal", notValues: [PROMETHEUS_PRINCIPAL] },
      ];
    }
    workload.rules!.push({
      from: [{ source: { principals: [PROMETHEUS_PRINCIPAL] } }],
      to: nonMetrics,
    });
  }
  return { browser, ingress, workload };
}
