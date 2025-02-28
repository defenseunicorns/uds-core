/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { IstioAuthorizationPolicy, RemoteGenerated, UDSPackage } from "../../crd";

import { Direction, Gateway } from "../../crd";
import { generateAuthorizationPolicies } from "./authorizationPolicies";

describe("generateAuthorizationPolicies", () => {
  // test("should generate correct AuthorizationPolicy for Loki", async () => {
  //     // Mock Loki Package with Network Rules
  //     const pkg: UDSPackage = {
  //         metadata: { name: "loki", namespace: "loki", generation: 1 },
  //         spec: {
  //             network: {
  //                 allow: [
  //                     {
  //                         direction: Direction.Ingress,
  //                         selector: { "app.kubernetes.io/name": "loki" },
  //                         remoteNamespace: "grafana",
  //                         remoteSelector: { "app.kubernetes.io/name": "grafana" },
  //                         ports: [8080],
  //                         description: "Grafana Log Queries",
  //                     },
  //                     {
  //                         direction: Direction.Ingress,
  //                         selector: { "app.kubernetes.io/name": "loki" },
  //                         remoteNamespace: "monitoring",
  //                         remoteSelector: { "app.kubernetes.io/name": "prometheus" },
  //                         ports: [3100],
  //                         description: "Prometheus Metrics",
  //                     },
  //                     {
  //                         direction: Direction.Ingress,
  //                         selector: { "app.kubernetes.io/name": "loki" },
  //                         remoteNamespace: "vector",
  //                         remoteSelector: { "app.kubernetes.io/name": "vector" },
  //                         ports: [8080],
  //                         description: "Vector Log Storage",
  //                     },
  //                     {
  //                         direction: Direction.Ingress,
  //                         remoteGenerated: RemoteGenerated.IntraNamespace,
  //                     },
  //                 ],
  //             },
  //         },
  //     };

  //     // Run function
  //     const policies: IstioAuthorizationPolicy[] = await generateAuthorizationPolicies(pkg);

  //     // Expect exactly one AuthorizationPolicy to be generated
  //     expect(policies.length).toBe(1);

  //     // Find the generated policy
  //     const policy = policies[0];

  //     // Validate policy metadata
  //     expect(policy.metadata?.name).toBe("protect-loki-workload");
  //     expect(policy.metadata?.namespace).toBe("loki");
  //     expect(policy.spec?.action).toBe("DENY");
  //     expect(policy.spec?.selector?.matchLabels).toEqual({
  //         "app.kubernetes.io/name": "loki",
  //     });

  //     // Validate that the policy has exactly 3 rules
  //     expect(policy.spec?.rules?.length).toBe(3);

  //     // Validate rule for Grafana: deny all ports except 8080
  //     expect(policy.spec?.rules).toContainEqual({
  //         from: [{ source: { namespaces: ["grafana"] } }],
  //         to: [{ operation: { notPorts: ["8080"] } }],
  //     });

  //     // Validate rule for Prometheus: deny all ports except 3100
  //     expect(policy.spec?.rules).toContainEqual({
  //         from: [{ source: { namespaces: ["monitoring"] } }],
  //         to: [{ operation: { notPorts: ["3100"] } }],
  //     });

  //     // Validate rule for Vector: deny all ports except 8080
  //     expect(policy.spec?.rules).toContainEqual({
  //         from: [{ source: { namespaces: ["vector"] } }],
  //         to: [{ operation: { notPorts: ["8080"] } }],
  //     });
  // });

  test("should generate correct AuthorizationPolicies for Neuvector", async () => {
    const pkg: UDSPackage = {
      metadata: { name: "neuvector", namespace: "neuvector", generation: 1 },
      spec: {
        network: {
          expose: [
            {
              service: "neuvector-service-webui",
              selector: { app: "neuvector-manager-pod" },
              gateway: Gateway.Admin,
              host: "neuvector",
              port: 8443,
            },
          ],
          allow: [
            { direction: Direction.Ingress, remoteGenerated: RemoteGenerated.IntraNamespace },
            { direction: Direction.Egress, remoteGenerated: RemoteGenerated.IntraNamespace },
            {
              direction: Direction.Ingress,
              remoteGenerated: RemoteGenerated.Anywhere,
              selector: { app: "neuvector-controller-pod" },
              port: 30443,
              description: "Webhook",
            },
          ],
        },
      },
    };

    const policies: IstioAuthorizationPolicy[] = await generateAuthorizationPolicies(pkg);

    // Expect exactly two policies.
    expect(policies.length).toBe(2);

    // Validate the controller policy:
    const controllerPolicy = policies.find(
      p => p.metadata?.name === "protect-neuvector-controller",
    );
    expect(controllerPolicy).toBeDefined();
    expect(controllerPolicy?.spec?.selector?.matchLabels).toEqual({
      app: "neuvector-controller-pod",
    });
    expect(controllerPolicy?.spec?.rules?.length).toBe(1);
    expect(controllerPolicy?.spec?.rules).toContainEqual({
      from: [{ source: { notNamespaces: ["neuvector"] } }],
      to: [{ operation: { notPorts: ["30443"] } }],
    });

    // Validate the manager policy:
    const managerPolicy = policies.find(p => p.metadata?.name === "protect-neuvector-manager");
    expect(managerPolicy).toBeDefined();
    expect(managerPolicy?.spec?.selector?.matchLabels).toEqual({ app: "neuvector-manager-pod" });
    expect(managerPolicy?.spec?.rules?.length).toBe(1);
    expect(managerPolicy?.spec?.rules).toContainEqual({
      from: [{ source: { namespaces: ["istio-admin-gateway"] } }],
      to: [{ operation: { notPorts: ["8443"] } }],
    });
  });

  // test("should generate correct AuthorizationPolicies for Metrics-Server", async () => {
  //     // Mock `metrics-server` Package with Network Rules
  //     const pkg: UDSPackage = {
  //         metadata: { name: "metrics-server", namespace: "metrics-server", generation: 1 },
  //         spec: {
  //             network: {
  //                 allow: [
  //                     {
  //                         direction: Direction.Egress,
  //                         selector: { "app.kubernetes.io/name": "metrics-server" },
  //                         remoteGenerated: RemoteGenerated.Anywhere,
  //                         port: 10250,
  //                     },
  //                     {
  //                         direction: Direction.Egress,
  //                         selector: { "app.kubernetes.io/name": "metrics-server" },
  //                         remoteGenerated: RemoteGenerated.KubeAPI,
  //                     },
  //                     {
  //                         direction: Direction.Ingress,
  //                         selector: { "app.kubernetes.io/name": "metrics-server" },
  //                         remoteGenerated: RemoteGenerated.Anywhere,
  //                         port: 10250,
  //                     },
  //                 ],
  //             },
  //         },
  //     };

  //     // Run function
  //     const policies: IstioAuthorizationPolicy[] = await generateAuthorizationPolicies(pkg);

  //     // Expect only **1** AuthorizationPolicy to be generated
  //     expect(policies.length).toBe(1);

  //     // Find the generated policy
  //     const policy = policies[0];

  //     // Validate policy metadata
  //     expect(policy.metadata?.name).toBe("protect-metrics-server-workload");
  //     expect(policy.metadata?.namespace).toBe("metrics-server");
  //     expect(policy.spec?.action).toBe("DENY");
  //     expect(policy.spec?.selector?.matchLabels).toEqual({
  //         "app.kubernetes.io/name": "metrics-server",
  //     });

  //     // Validate that the policy has **exactly 1 rule** (Ingress 10250 allow rule)
  //     expect(policy.spec?.rules?.length).toBe(1);

  //     // Validate the allow rule for port 10250 (Ingress)
  //     expect(policy.spec?.rules).toContainEqual({
  //         to: [{ operation: { ports: ["10250"] } }],
  //     });
  // });

  // test("should generate correct AuthorizationPolicies for vector", async () => {
  //     const pkg: UDSPackage = {
  //         metadata: { name: "vector", namespace: "vector", generation: 1 },
  //         spec: {
  //             network: {
  //                 allow: [
  //                     // Ingress from Prometheus on port 9090
  //                     {
  //                         direction: Direction.Ingress,
  //                         selector: { "app.kubernetes.io/name": "vector" },
  //                         remoteNamespace: "monitoring",
  //                         remoteSelector: { "app.kubernetes.io/name": "prometheus" },
  //                         port: 9090,
  //                         description: "Prometheus Metrics",
  //                     },
  //                 ],
  //             },
  //         },
  //     };

  //     // Generate policies
  //     const policies: IstioAuthorizationPolicy[] = await generateAuthorizationPolicies(pkg);

  //     // Expect exactly one AuthorizationPolicy
  //     expect(policies.length).toBe(1);

  //     // Find the policy and validate its selector
  //     const protectVectorPolicy = policies.find(p => p.metadata?.name === "protect-vector-workload");
  //     expect(protectVectorPolicy).toBeDefined();
  //     expect(protectVectorPolicy?.spec?.selector?.matchLabels).toEqual({
  //         "app.kubernetes.io/name": "vector",
  //     });

  //     const rules = protectVectorPolicy?.spec?.rules;
  //     expect(rules).toBeDefined();
  //     // Expect exactly one rule
  //     expect(rules?.length).toBe(1);

  //     // Validate the rule exactly matches the expected output.
  //     expect(rules).toContainEqual({
  //         from: [{ source: { namespaces: ["monitoring"] } }],
  //         to: [{ operation: { notPorts: ["9090"] } }],
  //     });
  // });

  // test("should generate correct AuthorizationPolicies for velero", async () => {
  //     const pkg: UDSPackage = {
  //         metadata: { name: "velero", namespace: "velero", generation: 1 },
  //         spec: {
  //             network: {
  //                 allow: [
  //                     // Ingress from Prometheus on port 8085
  //                     {
  //                         direction: Direction.Ingress,
  //                         selector: { "app.kubernetes.io/name": "velero" },
  //                         remoteNamespace: "monitoring",
  //                         remoteSelector: { app: "prometheus" },
  //                         port: 8085,
  //                         description: "Prometheus Metrics",
  //                     },
  //                 ],
  //             },
  //         },
  //     };

  //     // Generate policies
  //     const policies: IstioAuthorizationPolicy[] = await generateAuthorizationPolicies(pkg);

  //     // Expect exactly one AuthorizationPolicy to be generated
  //     expect(policies.length).toBe(1);

  //     // Find the policy
  //     const protectVeleroPolicy = policies.find(p => p.metadata?.name === "protect-velero");
  //     expect(protectVeleroPolicy).toBeDefined();
  //     expect(protectVeleroPolicy?.metadata?.namespace).toBe("velero");
  //     expect(protectVeleroPolicy?.spec?.action).toBe("DENY");
  //     expect(protectVeleroPolicy?.spec?.selector?.matchLabels).toEqual({
  //         "app.kubernetes.io/name": "velero",
  //     });

  //     const rules = protectVeleroPolicy?.spec?.rules;
  //     expect(rules).toBeDefined();
  //     // Update to expect one rule
  //     expect(rules?.length).toBe(1);

  //     // Validate the rule exactly matches the expected output.
  //     expect(rules).toContainEqual({
  //         from: [{ source: { namespaces: ["monitoring"] } }],
  //         to: [{ operation: { notPorts: ["8085"] } }],
  //     });
  // });

  // test("should generate correct AuthorizationPolicy for authservice", async () => {
  //     const pkg: UDSPackage = {
  //         metadata: { name: "authservice", namespace: "authservice", generation: 1 },
  //         spec: {
  //             network: {
  //                 allow: [
  //                     // Intra-namespace communication (Ingress & Egress)
  //                     { direction: Direction.Ingress, remoteGenerated: RemoteGenerated.IntraNamespace },
  //                     { direction: Direction.Egress, remoteGenerated: RemoteGenerated.IntraNamespace },

  //                     // Ingress to AuthService (Protected Apps)
  //                     {
  //                         direction: Direction.Ingress,
  //                         selector: { "app.kubernetes.io/name": "authservice" },
  //                         remoteNamespace: "",
  //                         port: 10003,
  //                         description: "Protected Apps",
  //                     },
  //                 ],
  //             },
  //         },
  //     };

  //     // Generate policies
  //     const policies: IstioAuthorizationPolicy[] = await generateAuthorizationPolicies(
  //         pkg
  //     );

  //     // Expect **one** AuthorizationPolicy to be generated
  //     expect(policies.length).toBe(1);

  //     // Find the policy
  //     const protectAuthservicePolicy = policies.find(p => p.metadata?.name === "protect-authservice-workload");

  //     // Validate `protect-authservice`
  //     expect(protectAuthservicePolicy).toBeDefined();
  //     expect(protectAuthservicePolicy?.spec?.selector?.matchLabels).toEqual({
  //         "app.kubernetes.io/name": "authservice",
  //     });

  //     const protectAuthserviceRules = protectAuthservicePolicy?.spec?.rules;
  //     expect(protectAuthserviceRules).toBeDefined();
  //     expect(protectAuthserviceRules?.length).toBe(1);

  //     // Validate deny rule: Deny all except intra-namespace traffic on port 10003
  //     expect(protectAuthserviceRules).toContainEqual({
  //         from: [{ source: { notNamespaces: ["authservice"] } }],
  //         to: [{ operation: { notPorts: ["10003"] } }],
  //     });
  // });

  // test("should generate correct AuthorizationPolicies for prometheus-stack", async () => {
  //     const pkg: UDSPackage = {
  //         metadata: { name: "prometheus-stack", namespace: "monitoring", generation: 1 },
  //         spec: {
  //             network: {
  //                 allow: [
  //                     // Intra-namespace HA rules
  //                     { direction: Direction.Ingress, remoteGenerated: RemoteGenerated.IntraNamespace },

  //                     // Ingress from Grafana on port 9090
  //                     {
  //                         direction: Direction.Ingress,
  //                         selector: { "app.kubernetes.io/name": "prometheus" },
  //                         remoteNamespace: "grafana",
  //                         remoteSelector: { "app.kubernetes.io/name": "grafana" },
  //                         port: 9090,
  //                     },

  //                     // Ingress from Anywhere on port 10250 (Webhook)
  //                     {
  //                         direction: Direction.Ingress,
  //                         selector: { app: "kube-prometheus-stack-operator" },
  //                         remoteGenerated: RemoteGenerated.Anywhere,
  //                         port: 10250,
  //                         description: "Webhook",
  //                     },
  //                 ],
  //             },
  //         },
  //     };

  //     // Generate policies
  //     const policies: IstioAuthorizationPolicy[] = await generateAuthorizationPolicies(pkg);

  //     // Expect exactly two AuthorizationPolicies to be generated
  //     expect(policies.length).toBe(2);

  //     // --- Expected policy for the webhook rule ---
  //     // This policy should match the YAML where:
  //     //   name: kube-prometheus-stack-operator
  //     //   namespace: prometheus-stack
  //     //   labels: { uds/package: prometheus-stack, uds/generation: "1" }
  //     const operatorPolicy = policies.find(p => p.metadata?.name === "kube-prometheus-stack-operator");
  //     expect(operatorPolicy).toBeDefined();
  //     expect(operatorPolicy?.metadata?.namespace).toBe("prometheus-stack");
  //     expect(operatorPolicy?.metadata?.labels).toMatchObject({
  //         "uds/package": "prometheus-stack",
  //         "uds/generation": "1",
  //     });
  //     expect(operatorPolicy?.spec?.action).toBe("DENY");
  //     expect(operatorPolicy?.spec?.selector?.matchLabels).toEqual({
  //         app: "kube-prometheus-stack-operator",
  //     });
  //     expect(operatorPolicy?.spec?.rules).toBeDefined();
  //     // Expected complementary rule: deny traffic on all ports except 10250.
  //     expect(operatorPolicy?.spec?.rules).toContainEqual({
  //         from: [{ source: { notNamespaces: ["monitoring"] } }],
  //         to: [{ operation: { notPorts: ["10250"] } }],
  //     });

  //     // --- Expected policy for the Grafana rule ---
  //     // This policy should match the YAML where:
  //     //   name: prometheus
  //     //   namespace: prometheus-stack
  //     //   labels: { uds/package: prometheus-stack, uds/generation: "1" }
  //     const prometheusPolicy = policies.find(p => p.metadata?.name === "prometheus");
  //     expect(prometheusPolicy).toBeDefined();
  //     expect(prometheusPolicy?.metadata?.namespace).toBe("prometheus-stack");
  //     expect(prometheusPolicy?.metadata?.labels).toMatchObject({
  //         "uds/package": "prometheus-stack",
  //         "uds/generation": "1",
  //     });
  //     expect(prometheusPolicy?.spec?.action).toBe("DENY");
  //     expect(prometheusPolicy?.spec?.selector?.matchLabels).toEqual({
  //         "app.kubernetes.io/name": "prometheus",
  //     });
  //     expect(prometheusPolicy?.spec?.rules).toBeDefined();
  //     // Expected complementary rule: allow only Grafana (from namespaces: ["grafana"]) on port 9090.
  //     expect(prometheusPolicy?.spec?.rules).toContainEqual({
  //         from: [{ source: { namespaces: ["grafana"] } }],
  //         to: [{ operation: { notPorts: ["9090"] } }],
  //     });
  // });

  // test("should generate correct AuthorizationPolicies for Grafana", async () => {
  //     const pkg: UDSPackage = {
  //         metadata: { name: "grafana", namespace: "grafana", generation: 1 },
  //         spec: {
  //             network: {
  //                 expose: [
  //                     {
  //                         service: "grafana",
  //                         selector: { "app.kubernetes.io/name": "grafana" },
  //                         host: "grafana",
  //                         gateway: Gateway.Admin,
  //                         port: 80,
  //                         targetPort: 3000,
  //                     },
  //                 ],
  //                 allow: [
  //                     {
  //                         direction: Direction.Ingress,
  //                         remoteGenerated: RemoteGenerated.IntraNamespace,
  //                         ports: [3000],
  //                     },
  //                 ],
  //             },
  //         },
  //     };

  //     // Generate policies
  //     const policies: IstioAuthorizationPolicy[] = await generateAuthorizationPolicies(pkg);

  //     // Expect exactly two AuthorizationPolicies to be generated
  //     expect(policies.length).toBe(2);

  //     // Validate the workload policy
  //     const workloadPolicy = policies.find(p => p.metadata?.name === "protect-grafana-workload");
  //     expect(workloadPolicy).toBeDefined();
  //     expect(workloadPolicy?.metadata?.namespace).toBe("grafana");
  //     expect(workloadPolicy?.spec?.selector?.matchLabels).toEqual({ "app.kubernetes.io/name": "grafana" });
  //     expect(workloadPolicy?.spec?.rules).toBeDefined();

  //     // Instead of checking for exactly three rules, only check that the two required rules are present:
  //     expect(workloadPolicy?.spec?.rules).toEqual(
  //         expect.arrayContaining([
  //             {
  //                 from: [{ source: { namespaces: ["monitoring"] } }],
  //                 to: [{ operation: { notPorts: ["3000"] } }],
  //             },
  //             {
  //                 from: [{ source: { namespaces: ["istio-admin-gateway"] } }],
  //                 to: [{ operation: { notPorts: ["3000"] } }],
  //             },
  //         ])
  //     );

  //     // Validate the namespace policy (name updated to match the expected YAML)
  //     const namespacePolicy = policies.find(p => p.metadata?.name === "protect-grafana-namespace");
  //     expect(namespacePolicy).toBeDefined();
  //     expect(namespacePolicy?.metadata?.namespace).toBe("grafana");
  //     expect(namespacePolicy?.spec?.rules).toBeDefined();
  //     expect(namespacePolicy?.spec?.rules?.length).toBe(1);
  //     expect(namespacePolicy?.spec?.rules).toContainEqual({
  //         from: [{ source: { namespaces: ["grafana"] } }],
  //         to: [{ operation: { notPorts: ["3000"] } }],
  //     });
  // });

  // test("should generate correct AuthorizationPolicies for keycloak", async () => {
  //     const pkg: UDSPackage = {
  //         metadata: { name: "keycloak", generation: 1 },
  //         spec: {
  //             network: {
  //                 allow: [
  //                     // Intra-namespace HA rules
  //                     { direction: Direction.Ingress, remoteGenerated: RemoteGenerated.IntraNamespace, ports: [7800, 57800] },

  //                     // Monitoring access to metrics
  //                     {
  //                         direction: Direction.Ingress,
  //                         selector: { "app.kubernetes.io/name": "keycloak" },
  //                         remoteNamespace: "monitoring",
  //                         port: 9000,
  //                     },

  //                     // Keycloak Backchannel Access (Any namespace on port 8080)
  //                     {
  //                         direction: Direction.Ingress,
  //                         selector: { "app.kubernetes.io/name": "keycloak" },
  //                         remoteNamespace: "*",
  //                         port: 8080,
  //                     },
  //                 ],
  //             },
  //         },
  //     };

  //     // Generate policies
  //     const policies: IstioAuthorizationPolicy[] = await generateAuthorizationPolicies(pkg);

  //     // Expect two AuthorizationPolicies to be generated
  //     expect(policies.length).toBe(2);

  //     // Find the policies
  //     const protectWorkloadPolicy = policies.find(p => p.metadata?.name === "protect-keycloak-workload");
  //     const protectNamespacePolicy = policies.find(p => p.metadata?.name === "protect-keycloak-ns");

  //     // === VALIDATE `protect-keycloak-workload` POLICY ===
  //     expect(protectWorkloadPolicy).toBeDefined();
  //     expect(protectWorkloadPolicy?.metadata?.namespace).toBe("keycloak");
  //     expect(protectWorkloadPolicy?.metadata?.labels).toEqual({
  //         "uds/package": "keycloak",
  //         "uds/generation": "1",
  //     });
  //     expect(protectWorkloadPolicy?.spec?.selector?.matchLabels).toEqual({ "app.kubernetes.io/name": "keycloak" });

  //     const protectWorkloadRules = protectWorkloadPolicy?.spec?.rules;
  //     expect(protectWorkloadRules).toBeDefined();
  //     // Updated expectation: workload policy now has exactly 2 rules
  //     expect(protectWorkloadRules?.length).toBe(2);

  //     // ✅ Validate monitoring rule: only traffic from monitoring is considered,
  //     // and traffic is allowed on all ports except 9000 and 8080.
  //     expect(protectWorkloadRules).toContainEqual({
  //         from: [{ source: { namespaces: ["monitoring"] } }],
  //         to: [{ operation: { notPorts: ["9000", "8080"] } }],
  //     });

  //     // === VALIDATE `protect-keycloak-ns` POLICY ===
  //     expect(protectNamespacePolicy).toBeDefined();
  //     expect(protectNamespacePolicy?.metadata?.namespace).toBe("keycloak");
  //     expect(protectNamespacePolicy?.metadata?.labels).toEqual({
  //         "uds/package": "keycloak",
  //         "uds/generation": "1",
  //     });

  //     const protectNamespaceRules = protectNamespacePolicy?.spec?.rules;
  //     expect(protectNamespaceRules).toBeDefined();
  //     // Updated expectation: namespace policy now has exactly 1 rule
  //     expect(protectNamespaceRules?.length).toBe(1);

  //     // ✅ Validate that the rule only allows keycloak namespace to access ports except 7800, 57800, and 8080.
  //     expect(protectNamespaceRules).toContainEqual({
  //         from: [{ source: { namespaces: ["keycloak"] } }],
  //         to: [{ operation: { notPorts: ["7800", "57800", "8080"] } }],
  //     });
  // });
});

// todo: if only intranamespace but has ports defined then we need to generate an authpol
// todo: namespace + selector how does this behave

// todo: another test case
/*
    - direction: Ingress
      remoteNamespace: foobar
      ports:
        - 2000

    - direction: Ingress
      selector:
        app.kubernetes.io/name: my-app
      remoteNamespace: foobar
      ports:
        - 3000
*/

// our only intent with authorization policies is to protect ports. we will use netpols to protect everything else.

// if intranamespace is defined with a port then we would need an authpol, without a port it wouldn't need a port unless
// it had an impact on one of the other rules ( like if there was an anywhere rule, the ports would need the intranamespace port as well)
// if the intranamespace has a selector then that would be an additional rule

// notNamespaces should only be used when there is to anywhere and a port defined
// otherwise should try to use namespaces with notPorts
// if there is a remoteGenerated: Anywhere we would add this:
/*
  - from:
      - source:
          notNamespaces: []
    to:
      - operation:
          ports: ["10250"]
*/
// which is equivalent to:
/*
  - to:
      - operation:
          ports: ["10250"]
*/
//if there is a second ingress with remoteNamespace and a different port then we would add this:
/*
  - from:
      - source:
          notNamespaces: ["foobar"]
    to:
      - operation:
          notPorts: ["2000", "10250"]
*/

// if all same selector
// monitoring -> any port
// anywhere -> port 10250
// grafana -> port 9090
/*
rules:
- from: // block anywhere traffic from going to NOT port 10250
    - source:
        notNamespace: ["monitoring", "grafana"]
  to:
    - operation:
        notPorts: ["10250"]
- from: // define where grafan is allowed to go
    - source:
        namespace: ["grafana"]
  to:
    - operation:
        ports: ["9090", "10250"]
*/
