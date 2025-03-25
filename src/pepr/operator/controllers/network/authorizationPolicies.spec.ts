/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { Direction, Gateway, RemoteGenerated, UDSPackage } from "../../crd";
import { Action } from "../../crd/generated/istio/authorizationpolicy-v1beta1";
import { generateAuthorizationPolicies } from "./authorizationPolicies";

describe("generateAuthorizationPolicies logic tests", () => {
  test("should merge multiple allow rules with the same selector", async () => {
    const pkg: UDSPackage = {
      metadata: { name: "myapp", namespace: "my-namespace", generation: 1 },
      spec: {
        network: {
          allow: [
            {
              direction: Direction.Ingress,
              remoteGenerated: RemoteGenerated.Anywhere,
              selector: { app: "my-app" },
              port: 80,
            },
            {
              direction: Direction.Ingress,
              remoteGenerated: RemoteGenerated.Anywhere,
              selector: { app: "my-app" },
              port: 443,
            },
          ],
        },
      },
    };

    const policies = await generateAuthorizationPolicies(pkg);
    expect(policies.length).toBe(1);
    const policy = policies[0];
    expect(policy.metadata?.name).toBe("protect-myapp-my-app");
    expect(policy.spec?.action).toBe(Action.Allow);
    expect(policy.spec?.rules).toEqual(
      expect.arrayContaining([
        {
          from: [{ source: { notNamespaces: ["my-namespace"] } }],
          to: [{ operation: { ports: expect.arrayContaining(["80", "443"]) } }],
        },
      ]),
    );
  });

  test("should override source with remoteServiceAccount", async () => {
    const pkg: UDSPackage = {
      metadata: { name: "authservice", namespace: "authservice", generation: 1 },
      spec: {
        network: {
          allow: [
            {
              direction: Direction.Ingress,
              remoteGenerated: RemoteGenerated.IntraNamespace,
              selector: { app: "auth-app" },
              port: 10003,
              remoteServiceAccount: "custom-sa",
            },
          ],
        },
      },
    };

    const policies = await generateAuthorizationPolicies(pkg);
    expect(policies.length).toBe(1);
    const policy = policies[0];
    expect(policy.spec?.action).toBe(Action.Allow);
    expect(policy.spec?.rules).toEqual(
      expect.arrayContaining([
        {
          from: [{ source: { principals: ["cluster.local/ns/authservice/sa/custom-sa"] } }],
          to: [{ operation: { ports: ["10003"] } }],
        },
      ]),
    );
  });

  test("should handle specific remoteNamespace vs remoteGenerated Anywhere", async () => {
    const pkg: UDSPackage = {
      metadata: { name: "testapp", namespace: "test-namespace", generation: 1 },
      spec: {
        network: {
          allow: [
            {
              direction: Direction.Ingress,
              remoteNamespace: "other-namespace",
              selector: { app: "test-app" },
              port: 3000,
            },
            {
              direction: Direction.Ingress,
              remoteGenerated: RemoteGenerated.Anywhere,
              selector: { app: "test-app" },
              port: 4000,
            },
          ],
        },
      },
    };

    const policies = await generateAuthorizationPolicies(pkg);
    expect(policies.length).toBe(1);
    const policy = policies[0];
    expect(policy.spec?.action).toBe(Action.Allow);
    expect(policy.spec?.rules?.length).toBe(2);
    expect(policy.spec?.rules).toEqual(
      expect.arrayContaining([
        {
          from: [{ source: { namespaces: ["other-namespace"] } }],
          to: [{ operation: { ports: ["3000"] } }],
        },
        {
          from: [{ source: { notNamespaces: ["test-namespace"] } }],
          to: [{ operation: { ports: ["4000"] } }],
        },
      ]),
    );
  });

  test("should include all ports from a rule with multiple ports", async () => {
    const pkg: UDSPackage = {
      metadata: { name: "multiports", namespace: "multi-ns", generation: 1 },
      spec: {
        network: {
          allow: [
            {
              direction: Direction.Ingress,
              remoteGenerated: RemoteGenerated.Anywhere,
              selector: { app: "multiports-app" },
              ports: [8080, 9090],
            },
          ],
        },
      },
    };

    const policies = await generateAuthorizationPolicies(pkg);
    expect(policies.length).toBe(1);
    const policy = policies[0];
    expect(policy.spec?.action).toBe(Action.Allow);
    expect(policy.spec?.rules).toEqual(
      expect.arrayContaining([
        {
          from: [{ source: { notNamespaces: ["multi-ns"] } }],
          to: [{ operation: { ports: expect.arrayContaining(["8080", "9090"]) } }],
        },
      ]),
    );
  });

  test("should generate a policy for rules with no port information", async () => {
    const pkg: UDSPackage = {
      metadata: { name: "noports", namespace: "noports-ns", generation: 1 },
      spec: {
        network: {
          allow: [
            {
              direction: Direction.Ingress,
              remoteGenerated: RemoteGenerated.Anywhere,
              selector: { app: "noports-app" },
              // No port or ports provided.
            },
          ],
        },
      },
    };

    const policies = await generateAuthorizationPolicies(pkg);
    expect(policies.length).toBe(1);
    const policy = policies[0];
    expect(policy.spec?.action).toBe(Action.Allow);
    // Rule should only have a "from" clause.
    expect(policy.spec?.rules).toEqual(
      expect.arrayContaining([
        {
          from: [{ source: { notNamespaces: ["noports-ns"] } }],
        },
      ]),
    );
  });

  test("should derive policy name using app.kubernetes.io/name if app label is missing", async () => {
    const pkg: UDSPackage = {
      metadata: { name: "testpkg", namespace: "testns", generation: 1 },
      spec: {
        network: {
          allow: [
            {
              direction: Direction.Ingress,
              selector: { "app.kubernetes.io/name": "example-pod" },
              port: 8080,
            },
          ],
        },
      },
    };

    const policies = await generateAuthorizationPolicies(pkg);
    expect(policies.length).toBe(1);
    expect(policies[0].metadata?.name).toBe("protect-testpkg-example-workload");
    expect(policies[0].spec?.action).toBe(Action.Allow);
  });

  test("should default source to package namespace when no remote info is provided", async () => {
    const pkg: UDSPackage = {
      metadata: { name: "defaultsrc", namespace: "defaultns", generation: 1 },
      spec: {
        network: {
          allow: [
            {
              direction: Direction.Ingress,
              selector: { app: "default-app" },
              port: 80,
            },
          ],
        },
      },
    };

    const policies = await generateAuthorizationPolicies(pkg);
    expect(policies.length).toBe(1);
    expect(policies[0].spec?.rules).toEqual(
      expect.arrayContaining([
        {
          from: [{ source: { namespaces: ["defaultns"] } }],
          to: [{ operation: { ports: ["80"] } }],
        },
      ]),
    );
    expect(policies[0].spec?.action).toBe(Action.Allow);
  });

  test("should use package namespace as source when remoteNamespace is empty", async () => {
    const pkg: UDSPackage = {
      metadata: { name: "emptyRemote", namespace: "emptyns", generation: 1 },
      spec: {
        network: {
          allow: [
            {
              direction: Direction.Ingress,
              selector: { app: "empty-app" },
              port: 8081,
              remoteNamespace: "", // explicitly empty
            },
          ],
        },
      },
    };

    const policies = await generateAuthorizationPolicies(pkg);
    expect(policies.length).toBe(1);
    expect(policies[0].spec?.rules).toEqual(
      expect.arrayContaining([
        {
          from: [{ source: { namespaces: ["emptyns"] } }],
          to: [{ operation: { ports: ["8081"] } }],
        },
      ]),
    );
    expect(policies[0].spec?.action).toBe(Action.Allow);
  });

  test("should default source to package namespace for expose rules when gateway is not Admin", async () => {
    const pkg: UDSPackage = {
      metadata: { name: "exposeTest", namespace: "exposeNs", generation: 1 },
      spec: {
        network: {
          expose: [
            {
              service: "test-service",
              selector: { foo: "bar" },
              gateway: Gateway.Tenant,
              host: "test.example.com",
              port: 8080,
            },
          ],
        },
      },
    };

    const policies = await generateAuthorizationPolicies(pkg);
    expect(policies.length).toBe(1);
    expect(policies[0].metadata?.name).toBe("protect-exposeTest-workload");
    expect(policies[0].spec?.rules).toEqual(
      expect.arrayContaining([
        {
          from: [{ source: { namespaces: ["exposeNs"] } }],
          to: [{ operation: { ports: ["8080"] } }],
        },
      ]),
    );
    expect(policies[0].spec?.action).toBe(Action.Allow);
  });

  test("should merge multiple expose rules with the same selector and gateway", async () => {
    const pkg: UDSPackage = {
      metadata: { name: "exposeMerge", namespace: "expose-ns", generation: 1 },
      spec: {
        network: {
          expose: [
            {
              service: "svc1",
              selector: { app: "merge-app" },
              gateway: Gateway.Admin,
              host: "host1",
              port: 8000,
            },
            {
              service: "svc2",
              selector: { app: "merge-app" },
              gateway: Gateway.Admin,
              host: "host2",
              port: 9000,
            },
          ],
        },
      },
    };

    const policies = await generateAuthorizationPolicies(pkg);
    expect(policies.length).toBe(1);
    const policy = policies[0];
    expect(policy.metadata?.name).toBe("protect-exposeMerge-merge-app");
    expect(policy.spec?.rules).toEqual(
      expect.arrayContaining([
        {
          from: [{ source: { namespaces: ["istio-admin-gateway"] } }],
          to: [{ operation: { ports: expect.arrayContaining(["8000", "9000"]) } }],
        },
      ]),
    );
    expect(policy.spec?.action).toBe(Action.Allow);
  });
});

describe("generateAuthorizationPolicies UDS Core Packages", () => {
  test("should generate correct AuthorizationPolicy for Loki", async () => {
    const pkg: UDSPackage = {
      metadata: { name: "loki", namespace: "loki", generation: 1 },
      spec: {
        network: {
          allow: [
            {
              direction: Direction.Ingress,
              remoteGenerated: RemoteGenerated.IntraNamespace,
              // No port provided.
            },
          ],
        },
      },
    };

    const policies = await generateAuthorizationPolicies(pkg);
    expect(policies.length).toBe(1);
    const policy = policies[0];
    expect(policy.metadata?.name).toBe("protect-loki-ns");
    expect(policy.metadata?.namespace).toBe("loki");
    expect(policy.spec?.action).toBe(Action.Allow);
    // The rule should only have a "from" clause (no port restrictions)
    expect(policy.spec?.rules).toEqual(
      expect.arrayContaining([
        {
          from: [{ source: { namespaces: ["loki"] } }],
        },
      ]),
    );
  });

  test("should generate correct policies for Neuvector", async () => {
    // Package with both an expose rule and allow rules.
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

    const policies = await generateAuthorizationPolicies(pkg);
    // Expect three policies: two workload policies and one namespace policy.
    expect(policies.length).toBe(3);

    // Workload policy from the allow rule with selector.
    const controllerPolicy = policies.find(
      p => p.metadata?.name === "protect-neuvector-neuvector-controller",
    );
    expect(controllerPolicy).toBeDefined();
    expect(controllerPolicy?.spec?.selector?.matchLabels).toEqual({
      app: "neuvector-controller-pod",
    });
    expect(controllerPolicy?.spec?.action).toBe(Action.Allow);
    expect(controllerPolicy?.spec?.rules).toEqual(
      expect.arrayContaining([
        {
          from: [{ source: { notNamespaces: ["neuvector"] } }],
          to: [{ operation: { ports: ["30443"] } }],
        },
      ]),
    );

    // Workload policy from the expose rule.
    const managerPolicy = policies.find(
      p => p.metadata?.name === "protect-neuvector-neuvector-manager",
    );
    expect(managerPolicy).toBeDefined();
    expect(managerPolicy?.spec?.selector?.matchLabels).toEqual({ app: "neuvector-manager-pod" });
    expect(managerPolicy?.spec?.action).toBe(Action.Allow);
    expect(managerPolicy?.spec?.rules).toEqual(
      expect.arrayContaining([
        {
          from: [{ source: { namespaces: ["istio-admin-gateway"] } }],
          to: [{ operation: { ports: ["8443"] } }],
        },
      ]),
    );

    // Namespace policy from the two intra-namespace rules.
    const nsPolicy = policies.find(p => p.metadata?.name === "protect-neuvector-ns");
    expect(nsPolicy).toBeDefined();
    expect(nsPolicy?.metadata?.namespace).toBe("neuvector");
    expect(nsPolicy?.spec?.action).toBe(Action.Allow);
    // Rule should have only a "from" clause.
    expect(nsPolicy?.spec?.rules).toEqual(
      expect.arrayContaining([
        {
          from: [{ source: { namespaces: ["neuvector"] } }],
        },
      ]),
    );
  });

  test("should generate correct AuthorizationPolicies for metrics-server", async () => {
    const pkg: UDSPackage = {
      metadata: { name: "metrics-server", namespace: "metrics-server", generation: 1 },
      spec: {
        network: {
          allow: [
            {
              direction: Direction.Egress,
              remoteGenerated: RemoteGenerated.Anywhere,
              port: 10250,
            },
          ],
        },
      },
    };

    const policies = await generateAuthorizationPolicies(pkg);
    // Expect one policy generated (namespace policy)
    expect(policies.length).toBe(1);
    const nsPolicy = policies[0];
    expect(nsPolicy.metadata?.name).toBe("protect-metrics-server-ns");
    expect(nsPolicy.metadata?.namespace).toBe("metrics-server");
    expect(nsPolicy.spec?.action).toBe(Action.Allow);
    expect(nsPolicy.spec?.rules).toEqual(
      expect.arrayContaining([
        {
          from: [{ source: { notNamespaces: ["metrics-server"] } }],
          to: [{ operation: { ports: ["10250"] } }],
        },
      ]),
    );
  });

  test("should generate correct AuthorizationPolicies for vector", async () => {
    const pkg: UDSPackage = {
      metadata: { name: "vector", namespace: "vector", generation: 1 },
      spec: {
        network: {
          allow: [
            {
              direction: Direction.Ingress,
              selector: { "app.kubernetes.io/name": "vector" },
              remoteNamespace: "monitoring",
              remoteSelector: { "app.kubernetes.io/name": "prometheus" },
              port: 9090,
              description: "Prometheus Metrics",
            },
          ],
        },
      },
    };

    const policies = await generateAuthorizationPolicies(pkg);
    expect(policies.length).toBe(1);
    const policy = policies[0];
    expect(policy.metadata?.name).toBe("protect-vector-vector-workload");
    expect(policy.spec?.action).toBe(Action.Allow);
    expect(policy.spec?.selector?.matchLabels).toEqual({ "app.kubernetes.io/name": "vector" });
    expect(policy.spec?.rules).toEqual(
      expect.arrayContaining([
        {
          from: [{ source: { namespaces: ["monitoring"] } }],
          to: [{ operation: { ports: ["9090"] } }],
        },
      ]),
    );
  });

  test("should generate correct AuthorizationPolicies for velero", async () => {
    const pkg: UDSPackage = {
      metadata: { name: "velero", namespace: "velero", generation: 1 },
      spec: {
        network: {
          allow: [
            {
              direction: Direction.Ingress,
              selector: { "app.kubernetes.io/name": "velero" },
              remoteNamespace: "monitoring",
              remoteSelector: { "app.kubernetes.io/name": "prometheus" },
              port: 8085,
              description: "Prometheus Metrics",
            },
          ],
        },
      },
    };

    const policies = await generateAuthorizationPolicies(pkg);
    expect(policies.length).toBe(1);
    const policy = policies[0];
    expect(policy.metadata?.name).toBe("protect-velero-velero-workload");
    expect(policy.spec?.action).toBe(Action.Allow);
    expect(policy.spec?.selector?.matchLabels).toEqual({ "app.kubernetes.io/name": "velero" });
    expect(policy.spec?.rules).toEqual(
      expect.arrayContaining([
        {
          from: [{ source: { namespaces: ["monitoring"] } }],
          to: [{ operation: { ports: ["8085"] } }],
        },
      ]),
    );
  });

  test("should generate correct AuthorizationPolicy for authservice", async () => {
    const pkg: UDSPackage = {
      metadata: { name: "authservice", namespace: "authservice", generation: 1 },
      spec: {
        network: {
          allow: [
            { direction: Direction.Ingress, remoteGenerated: RemoteGenerated.IntraNamespace },
            { direction: Direction.Egress, remoteGenerated: RemoteGenerated.IntraNamespace },
            {
              direction: Direction.Ingress,
              selector: { "app.kubernetes.io/name": "authservice" },
              remoteNamespace: "",
              port: 10003,
              description: "Protected Apps",
            },
          ],
        },
      },
    };

    const policies = await generateAuthorizationPolicies(pkg);
    expect(policies.length).toBe(2);

    const nsPolicy = policies.find(p => p.metadata?.name === "protect-authservice-ns");
    expect(nsPolicy).toBeDefined();
    expect(nsPolicy?.metadata?.namespace).toBe("authservice");
    expect(nsPolicy?.spec?.action).toBe(Action.Allow);
    expect(nsPolicy?.spec?.rules).toEqual(
      expect.arrayContaining([
        {
          from: [{ source: { namespaces: ["authservice"] } }],
        },
      ]),
    );

    const workloadPolicy = policies.find(
      p => p.metadata?.name === "protect-authservice-authservice-workload",
    );
    expect(workloadPolicy).toBeDefined();
    expect(workloadPolicy?.spec?.selector?.matchLabels).toEqual({
      "app.kubernetes.io/name": "authservice",
    });
    expect(workloadPolicy?.spec?.action).toBe(Action.Allow);
    expect(workloadPolicy?.spec?.rules).toEqual(
      expect.arrayContaining([
        {
          from: [{ source: { namespaces: ["authservice"] } }],
          to: [{ operation: { ports: ["10003"] } }],
        },
      ]),
    );
  });

  test("should generate correct AuthorizationPolicies for prometheus-stack", async () => {
    const pkg: UDSPackage = {
      metadata: { name: "prometheus-stack", namespace: "monitoring", generation: 1 },
      spec: {
        network: {
          allow: [
            { direction: Direction.Ingress, remoteGenerated: RemoteGenerated.IntraNamespace },
            {
              direction: Direction.Ingress,
              selector: { "app.kubernetes.io/name": "prometheus" },
              remoteNamespace: "grafana",
              remoteSelector: { "app.kubernetes.io/name": "grafana" },
              port: 9090,
            },
            {
              direction: Direction.Ingress,
              selector: { app: "kube-prometheus-stack-operator" },
              remoteGenerated: RemoteGenerated.Anywhere,
              port: 10250,
              description: "Webhook",
            },
          ],
        },
      },
    };

    const policies = await generateAuthorizationPolicies(pkg);
    // Expect three policies: one namespace policy and two workload policies.
    expect(policies.length).toBe(3);

    const nsPolicy = policies.find(p => p.metadata?.name === "protect-prometheus-stack-ns");
    expect(nsPolicy).toBeDefined();
    expect(nsPolicy?.metadata?.namespace).toBe("monitoring");
    expect(nsPolicy?.spec?.action).toBe(Action.Allow);
    expect(nsPolicy?.spec?.rules).toEqual(
      expect.arrayContaining([
        {
          from: [{ source: { namespaces: ["monitoring"] } }],
        },
      ]),
    );

    const promPolicy = policies.find(
      p => p.metadata?.name === "protect-prometheus-stack-prometheus-workload",
    );
    expect(promPolicy).toBeDefined();
    expect(promPolicy?.spec?.selector?.matchLabels).toEqual({
      "app.kubernetes.io/name": "prometheus",
    });
    expect(promPolicy?.spec?.action).toBe(Action.Allow);
    expect(promPolicy?.spec?.rules).toEqual(
      expect.arrayContaining([
        {
          from: [{ source: { namespaces: ["grafana"] } }],
          to: [{ operation: { ports: ["9090"] } }],
        },
      ]),
    );

    const operatorPolicy = policies.find(
      p => p.metadata?.name === "protect-prometheus-stack-kube-prometheus-stack-operator",
    );
    expect(operatorPolicy).toBeDefined();
    expect(operatorPolicy?.spec?.selector?.matchLabels).toEqual({
      app: "kube-prometheus-stack-operator",
    });
    expect(operatorPolicy?.spec?.action).toBe(Action.Allow);
    expect(operatorPolicy?.spec?.rules).toEqual(
      expect.arrayContaining([
        {
          from: [{ source: { notNamespaces: ["monitoring"] } }],
          to: [{ operation: { ports: ["10250"] } }],
        },
      ]),
    );
  });

  test("should generate correct AuthorizationPolicies for Grafana including monitor block", async () => {
    const pkg: UDSPackage = {
      metadata: { name: "grafana", namespace: "grafana", generation: 1 },
      spec: {
        monitor: [
          {
            description: "Metrics",
            podSelector: { "app.kubernetes.io/name": "grafana" },
            portName: "service",
            selector: { "app.kubernetes.io/name": "grafana" },
            targetPort: 3000,
          },
        ],
        network: {
          expose: [
            {
              service: "grafana",
              selector: { "app.kubernetes.io/name": "grafana" },
              host: "grafana",
              gateway: Gateway.Admin,
              port: 80,
              targetPort: 3000,
            },
          ],
          allow: [
            {
              direction: Direction.Ingress,
              remoteGenerated: RemoteGenerated.IntraNamespace,
              ports: [3000],
            },
          ],
        },
      },
    };

    const policies = await generateAuthorizationPolicies(pkg);
    // Expect three policies: one workload policy (from expose), one namespace-wide policy (from allow), and one monitor policy (from monitor block)
    expect(policies.length).toBe(3);

    // Verify the workload policy from expose rules.
    const exposePolicy = policies.find(
      p => p.metadata?.name === "protect-grafana-grafana-workload",
    );
    expect(exposePolicy).toBeDefined();
    expect(exposePolicy?.spec?.selector?.matchLabels).toEqual({
      "app.kubernetes.io/name": "grafana",
    });
    expect(exposePolicy?.spec?.action).toBe(Action.Allow);
    expect(exposePolicy?.spec?.rules).toEqual(
      expect.arrayContaining([
        {
          from: [{ source: { namespaces: ["istio-admin-gateway"] } }],
          to: [{ operation: { ports: ["3000"] } }],
        },
      ]),
    );

    // Verify the namespace-wide policy from allow rules.
    const nsPolicy = policies.find(p => p.metadata?.name === "protect-grafana-ns");
    expect(nsPolicy).toBeDefined();
    expect(nsPolicy?.metadata?.namespace).toBe("grafana");
    expect(nsPolicy?.spec?.action).toBe(Action.Allow);
    expect(nsPolicy?.spec?.rules).toEqual(
      expect.arrayContaining([
        {
          from: [{ source: { namespaces: ["grafana"] } }],
          to: [{ operation: { ports: ["3000"] } }],
        },
      ]),
    );

    const monitorPolicy = policies.find(
      p => p.metadata?.name === "protect-grafana-monitor-grafana-workload",
    );
    expect(monitorPolicy).toBeDefined();
    expect(monitorPolicy?.metadata?.namespace).toBe("grafana");
    expect(monitorPolicy?.spec?.action).toBe(Action.Allow);
    expect(monitorPolicy?.spec?.selector?.matchLabels).toEqual({
      "app.kubernetes.io/name": "grafana",
    });
    expect(monitorPolicy?.spec?.rules).toEqual(
      expect.arrayContaining([
        {
          from: [{ source: { namespaces: ["monitoring"] } }],
          to: [{ operation: { ports: ["3000"] } }],
        },
      ]),
    );
  });

  test("should generate correct AuthorizationPolicies for keycloak", async () => {
    const pkg: UDSPackage = {
      metadata: { name: "keycloak", namespace: "keycloak", generation: 1 },
      spec: {
        network: {
          allow: [
            {
              direction: Direction.Ingress,
              remoteGenerated: RemoteGenerated.IntraNamespace,
              ports: [7800, 57800],
            },
            {
              direction: Direction.Ingress,
              selector: { "app.kubernetes.io/name": "keycloak" },
              remoteNamespace: "monitoring",
              port: 9000,
            },
            {
              direction: Direction.Ingress,
              selector: { "app.kubernetes.io/name": "keycloak" },
              remoteNamespace: "*",
              port: 8080,
            },
          ],
        },
      },
    };

    const policies = await generateAuthorizationPolicies(pkg);
    // Expect two policies: one namespace policy and one workload policy.
    expect(policies.length).toBe(2);

    const nsPolicy = policies.find(p => p.metadata?.name === "protect-keycloak-ns");
    expect(nsPolicy).toBeDefined();
    expect(nsPolicy?.metadata?.namespace).toBe("keycloak");
    expect(nsPolicy?.spec?.action).toBe(Action.Allow);
    expect(nsPolicy?.spec?.rules).toEqual(
      expect.arrayContaining([
        {
          from: [{ source: { namespaces: ["keycloak"] } }],
          to: [{ operation: { ports: expect.arrayContaining(["7800", "57800"]) } }],
        },
      ]),
    );

    const workloadPolicy = policies.find(
      p => p.metadata?.name === "protect-keycloak-keycloak-workload",
    );
    expect(workloadPolicy).toBeDefined();
    expect(workloadPolicy?.spec?.selector?.matchLabels).toEqual({
      "app.kubernetes.io/name": "keycloak",
    });
    expect(workloadPolicy?.spec?.action).toBe(Action.Allow);
    expect(workloadPolicy?.spec?.rules).toEqual(
      expect.arrayContaining([
        {
          from: [{ source: { namespaces: ["monitoring"] } }],
          to: [{ operation: { ports: ["9000"] } }],
        },
        {
          from: [{ source: { notNamespaces: ["keycloak"] } }],
          to: [{ operation: { ports: ["8080"] } }],
        },
      ]),
    );
  });
});
