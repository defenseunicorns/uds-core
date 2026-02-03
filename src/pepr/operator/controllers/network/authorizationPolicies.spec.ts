/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { describe, expect, test, vi } from "vitest";
import {
  Action,
  AuthorizationPolicy,
} from "../../crd/generated/istio/authorizationpolicy-v1beta1.js";
import { Mode } from "../../crd/generated/package-v1alpha1.js";
import { Direction, Gateway, RemoteGenerated, UDSPackage } from "../../crd/index.js";
import { IstioState } from "../istio/namespace.js";
import {
  createDenyAllExceptWaypointPolicy,
  findMatchingSsoClient,
  generateAuthorizationPolicies,
} from "./authorizationPolicies.js";

vi.mock("../../../logger", () => ({
  setupLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    trace: vi.fn(),
  }),
  Component: {
    OPERATOR_NETWORK: "OPERATOR_NETWORK",
  },
}));

vi.mock("pepr", () => ({
  K8s: vi.fn(() => ({
    Apply: vi.fn().mockResolvedValue({}),
    InNamespace: vi.fn().mockReturnThis(),
    WithLabel: vi.fn().mockReturnThis(),
    Get: vi.fn().mockResolvedValue({ items: [] }),
  })),
}));

vi.mock("./generators/cloudMetadata", () => ({
  META_IP: "169.254.169.254/32",
}));

vi.mock("./generators/kubeAPI", () => ({
  kubeAPI: () => [{ ipBlock: { cidr: "10.0.0.1/32" } }],
}));

vi.mock("./generators/kubeNodes", () => ({
  kubeNodes: () => [{ ipBlock: { cidr: "192.168.0.0/16" } }],
}));

describe("flexible gateway configuration", () => {
  test("should generate correct principal for custom gateway", async () => {
    const pkg: UDSPackage = {
      metadata: { name: "custom-gateway-test", namespace: "test-ns", generation: 1 },
      spec: {
        network: {
          expose: [
            {
              service: "test-service",
              selector: { app: "test-app" },
              gateway: "custom",
              host: "test",
              port: 8080,
            },
          ],
        },
      },
    };

    const policies = await generateAuthorizationPolicies(pkg, "test-ns", IstioState.Ambient);
    expect(policies.length).toBe(1);
    const policy = policies[0];
    expect(policy.metadata?.name).toBe(
      "protect-custom-gateway-test-ingress-8080-test-app-istio-custom-gateway",
    );
    expect(policy.spec?.rules?.[0].from?.[0].source).toEqual({
      principals: ["cluster.local/ns/istio-custom-gateway/sa/custom-ingressgateway"],
    });
  });

  test("should generate correct principal for admin-like custom gateway", async () => {
    const pkg: UDSPackage = {
      metadata: { name: "admin-like-test", namespace: "test-ns", generation: 1 },
      spec: {
        network: {
          expose: [
            {
              service: "test-service",
              selector: { app: "test-app" },
              gateway: "my-admin",
              host: "test",
              port: 8080,
            },
          ],
        },
      },
    };

    const policies = await generateAuthorizationPolicies(pkg, "test-ns", IstioState.Ambient);
    expect(policies.length).toBe(1);
    const policy = policies[0];
    expect(policy.spec?.rules?.[0].from?.[0].source).toEqual({
      principals: ["cluster.local/ns/istio-my-admin-gateway/sa/my-admin-ingressgateway"],
    });
  });

  test("should generate correct principal for passthrough-like custom gateway", async () => {
    const pkg: UDSPackage = {
      metadata: { name: "passthrough-like-test", namespace: "test-ns", generation: 1 },
      spec: {
        network: {
          expose: [
            {
              service: "test-service",
              selector: { app: "test-app" },
              gateway: "my-passthrough",
              host: "test",
              port: 8443,
            },
          ],
        },
      },
    };

    const policies = await generateAuthorizationPolicies(pkg, "test-ns", IstioState.Ambient);
    expect(policies.length).toBe(1);
    const policy = policies[0];
    expect(policy.spec?.rules?.[0].from?.[0].source).toEqual({
      principals: [
        "cluster.local/ns/istio-my-passthrough-gateway/sa/my-passthrough-ingressgateway",
      ],
    });
  });
});

describe("authorization policy generation", () => {
  test("should generate authpol with ipBlock for CloudMetadata", async () => {
    const pkg: UDSPackage = {
      metadata: { name: "cloud-metadata-test", namespace: "test-ns", generation: 1 },
      spec: {
        network: {
          allow: [
            {
              direction: Direction.Ingress,
              remoteGenerated: RemoteGenerated.CloudMetadata,
              selector: { app: "cloud-metadata-test" },
            },
          ],
        },
      },
    };

    const policies = await generateAuthorizationPolicies(pkg, "test-ns", IstioState.Ambient);
    expect(policies.length).toBe(1);
    const policy = policies[0];
    expect(policy.metadata?.name).toBe(
      "protect-cloud-metadata-test-ingress-cloud-metadata-test-cloudmetadata",
    );
    expect(policy.spec?.rules?.[0].from?.[0].source).toEqual({
      ipBlocks: ["169.254.169.254/32"],
    });
  });

  test("should generate authpol with ipBlock from kubeAPI", async () => {
    const pkg: UDSPackage = {
      metadata: { name: "kubeapi-test", namespace: "test-ns", generation: 1 },
      spec: {
        network: {
          allow: [
            {
              direction: Direction.Ingress,
              remoteGenerated: RemoteGenerated.KubeAPI,
              selector: { app: "kubeapi-test" },
            },
          ],
        },
      },
    };

    const policies = await generateAuthorizationPolicies(pkg, "test-ns", IstioState.Ambient);
    expect(policies.length).toBe(1);
    const policy = policies[0];
    expect(policy.metadata?.name).toBe("protect-kubeapi-test-ingress-kubeapi-test-kubeapi");
    expect(policy.spec?.rules?.[0].from?.[0].source).toEqual({
      ipBlocks: ["10.0.0.1/32"],
    });
  });

  test("should generate authpol with ipBlock from kubeNodes", async () => {
    const pkg: UDSPackage = {
      metadata: { name: "kubenodes-test", namespace: "test-ns", generation: 1 },
      spec: {
        network: {
          allow: [
            {
              direction: Direction.Ingress,
              remoteGenerated: RemoteGenerated.KubeNodes,
              selector: { app: "kubenodes-test" },
            },
          ],
        },
      },
    };

    const policies = await generateAuthorizationPolicies(pkg, "test-ns", IstioState.Ambient);
    expect(policies.length).toBe(1);
    const policy = policies[0];
    expect(policy.metadata?.name).toBe("protect-kubenodes-test-ingress-kubenodes-test-kubenodes");
    expect(policy.spec?.rules?.[0].from?.[0].source).toEqual({
      ipBlocks: ["192.168.0.0/16"],
    });
  });

  test("should generate an authpol with ipBlocks from remoteCidr", async () => {
    const pkg: UDSPackage = {
      metadata: { name: "curl-pkg-remote-cidr", namespace: "curl-ns-remote-cidr", generation: 1 },
      spec: {
        network: {
          allow: [
            {
              direction: Direction.Ingress,
              remoteCidr: "0.0.0.0/0",
              selector: { app: "curl-pkg-remote-cidr" },
            },
          ],
        },
      },
    };

    const policies: AuthorizationPolicy[] = await generateAuthorizationPolicies(
      pkg,
      "curl-ns-remote-cidr",
      IstioState.Ambient,
    );
    expect(policies).toHaveLength(1);
    const policy = policies[0];
    expect(policy.metadata?.namespace).toBe("curl-ns-remote-cidr");
    // The selector should match the rule's selector
    expect(policy.spec?.selector?.matchLabels).toEqual({ app: "curl-pkg-remote-cidr" });

    // The rule should have a "from" block with source containing ipBlocks
    expect(policy.spec?.rules).toHaveLength(1);
    const rule = policy.spec!.rules![0];

    // Since remoteCidr was provided, the computed source should use ipBlocks
    expect(rule.from).toBeDefined();
    expect(rule.from![0].source).toEqual({ ipBlocks: ["0.0.0.0/0"] });

    // And no "to" clause should be present because no port was specified
    expect(rule.to).toBeUndefined();

    // Also verify that the action is Allow
    expect(policy.spec?.action).toBe(Action.Allow);
  });

  test("should generate two distinct policies for expose and allow rules", async () => {
    const pkg: UDSPackage = {
      apiVersion: "uds.dev/v1alpha1",
      kind: "Package",
      metadata: {
        name: "httpbin-other",
        namespace: "authservice-sidecar-test-app",
        generation: 1,
      },
      spec: {
        sso: [
          {
            name: "Demo SSO",
            clientId: "uds-core-sidecar-httpbin",
            redirectUris: ["https://protected.uds.dev/login"],
            enableAuthserviceSelector: { app: "httpbin" },
            groups: { anyOf: ["/UDS Core/Admin"] },
          },
        ],
        network: {
          serviceMesh: {
            mode: Mode.Sidecar,
          },
          expose: [
            {
              service: "httpbin",
              selector: { app: "httpbin" },
              gateway: Gateway.Tenant,
              host: "protected",
              port: 8000,
              targetPort: 80,
            },
          ],
          allow: [
            {
              direction: Direction.Ingress,
              selector: { app: "httpbin" },
              ports: [80],
            },
          ],
        },
      },
    };

    const policies = await generateAuthorizationPolicies(
      pkg,
      "authservice-sidecar-test-app",
      IstioState.Ambient,
    );
    // We expect exactly two policies: one for the expose rule and one for the allow rule.
    expect(policies.length).toBe(2);

    // Allow rule policy (generated via generateAllowName)
    const allowPolicy = policies.find(
      p => p.metadata?.name === "protect-httpbin-other-ingress-httpbin-default-all-pods",
    );
    expect(allowPolicy).toBeDefined();
    expect(allowPolicy!.spec!.action).toBe(Action.Allow);
    expect(allowPolicy!.spec!.selector?.matchLabels).toEqual({ app: "httpbin" });
    expect(allowPolicy!.spec!.rules![0].to).toEqual([{ operation: { ports: ["80"] } }]);

    // Expose rule policy (generated via generateExposeName)
    const exposePolicy = policies.find(
      p => p.metadata?.name === "protect-httpbin-other-ingress-80-httpbin-istio-tenant-gateway",
    );
    expect(exposePolicy).toBeDefined();
    expect(exposePolicy!.spec!.action).toBe(Action.Allow);
    // For expose, no selector is applied by default
    expect(exposePolicy!.spec!.rules![0].from).toEqual([
      {
        source: {
          principals: ["cluster.local/ns/istio-tenant-gateway/sa/tenant-ingressgateway"],
        },
      },
    ]);
    expect(exposePolicy!.spec!.rules![0].to).toEqual([{ operation: { ports: ["80"] } }]);
  });

  test("should generate unique AuthorizationPolicies for expose rules with different ports", async () => {
    const pkg: UDSPackage = {
      metadata: { name: "test-tenant-app", namespace: "test-tenant-app", generation: 1 },
      spec: {
        network: {
          expose: [
            {
              service: "test-tenant-app",
              selector: { app: "test-tenant-app" },
              gateway: Gateway.Tenant,
              host: "demo-8080",
              port: 8080,
            },
            {
              service: "test-tenant-app",
              selector: { app: "test-tenant-app" },
              gateway: Gateway.Tenant,
              host: "demo-8081",
              port: 8081,
            },
          ],
        },
      },
    };

    const policies = await generateAuthorizationPolicies(
      pkg,
      "test-tenant-app",
      IstioState.Ambient,
    );
    expect(policies.length).toBe(2);
    const names = policies.map(p => p.metadata?.name);
    expect(new Set(names).size).toBe(2);
    expect(names.some(name => name?.includes("8080"))).toBe(true);
    expect(names.some(name => name?.includes("8081"))).toBe(true);
  });

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

    const policies = await generateAuthorizationPolicies(pkg, "loki", IstioState.Ambient);
    // With one allow rule (Ingress/IntraNamespace), expect one policy
    expect(policies.length).toBe(1);
    const policy = policies[0];
    expect(policy.metadata?.name).toBe("protect-loki-ingress-all-pods-intranamespace");
    expect(policy.metadata?.namespace).toBe("loki");
    expect(policy.spec?.action).toBe(Action.Allow);
    // The rule should only have a "from" clause with source { namespaces: ["loki"] }
    expect(policy.spec?.rules).toEqual(
      expect.arrayContaining([{ from: [{ source: { namespaces: ["loki"] } }] }]),
    );
  });

  test("should generate correct policies for Falco", async () => {
    const pkg: UDSPackage = {
      metadata: { name: "falco", namespace: "falco", generation: 1 },
      spec: {
        network: {
          allow: [
            { direction: Direction.Ingress, remoteGenerated: RemoteGenerated.IntraNamespace },
            // Egress IntraNamespace is intentionally skipped by the generator
            {
              direction: Direction.Ingress,
              selector: { "app.kubernetes.io/name": "falco" },
              remoteNamespace: "monitoring",
              remoteSelector: { "app.kubernetes.io/name": "prometheus" },
              remoteServiceAccount: "kube-prometheus-stack-prometheus",
              port: 8765,
              description: "Prometheus Falco Metrics",
            },
            {
              direction: Direction.Ingress,
              selector: { "app.kubernetes.io/name": "falcosidekick" },
              remoteNamespace: "monitoring",
              remoteSelector: { "app.kubernetes.io/name": "prometheus" },
              remoteServiceAccount: "kube-prometheus-stack-prometheus",
              port: 2801,
              description: "Prometheus Falcosidekick Metrics",
            },
          ],
        },
      },
    };

    const policies = await generateAuthorizationPolicies(pkg, "falco", IstioState.Ambient);
    // With current design we expect three policies (Ingress IntraNamespace + two Prometheus metrics)
    expect(policies.length).toBe(3);

    // Policy for the IntraNamespace allow rule (no selector)
    const nsPolicy = policies.find(
      p => p.metadata?.name === "protect-falco-ingress-all-pods-intranamespace",
    );
    expect(nsPolicy).toBeDefined();
    expect(nsPolicy?.metadata?.namespace).toBe("falco");
    expect(nsPolicy?.spec?.action).toBe(Action.Allow);
    expect(nsPolicy?.spec?.rules).toEqual(
      expect.arrayContaining([{ from: [{ source: { namespaces: ["falco"] } }] }]),
    );

    // Policy for Falco metrics (Prometheus -> Falco)
    const falcoMetrics = policies.find(
      p => p.metadata?.name === "protect-falco-ingress-prometheus-falco-metrics",
    );
    expect(falcoMetrics).toBeDefined();
    expect(falcoMetrics?.spec?.selector?.matchLabels).toEqual({
      "app.kubernetes.io/name": "falco",
    });
    expect(falcoMetrics?.spec?.action).toBe(Action.Allow);
    expect(falcoMetrics?.spec?.rules).toEqual(
      expect.arrayContaining([
        {
          from: [
            {
              source: {
                principals: ["cluster.local/ns/monitoring/sa/kube-prometheus-stack-prometheus"],
              },
            },
          ],
          to: [{ operation: { ports: ["8765"] } }],
        },
      ]),
    );

    // Policy for Falcosidekick metrics (Prometheus -> Falcosidekick)
    const sidekickMetrics = policies.find(
      p => p.metadata?.name === "protect-falco-ingress-prometheus-falcosidekick-metrics",
    );
    expect(sidekickMetrics).toBeDefined();
    expect(sidekickMetrics?.spec?.selector?.matchLabels).toEqual({
      "app.kubernetes.io/name": "falcosidekick",
    });
    expect(sidekickMetrics?.spec?.action).toBe(Action.Allow);
    expect(sidekickMetrics?.spec?.rules).toEqual(
      expect.arrayContaining([
        {
          from: [
            {
              source: {
                principals: ["cluster.local/ns/monitoring/sa/kube-prometheus-stack-prometheus"],
              },
            },
          ],
          to: [{ operation: { ports: ["2801"] } }],
        },
      ]),
    );
  });

  test("should generate correct AuthorizationPolicies for Vector", async () => {
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

    const policies = await generateAuthorizationPolicies(pkg, "vector", IstioState.Ambient);
    expect(policies.length).toBe(1);
    const policy = policies[0];
    expect(policy.metadata?.name).toBe("protect-vector-ingress-prometheus-metrics");
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

  test("should generate correct AuthorizationPolicies for Velero", async () => {
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
              description: "Protected Apps",
            },
          ],
        },
      },
    };

    const policies = await generateAuthorizationPolicies(pkg, "velero", IstioState.Ambient);
    // Expect one policy
    expect(policies.length).toBe(1);
    const policy = policies[0];
    expect(policy.metadata?.name).toBe("protect-velero-ingress-protected-apps");
    expect(policy.metadata?.namespace).toBe("velero");
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

  test("should generate correct AuthorizationPolicies for Ambient Authservice", async () => {
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

    const policies = await generateAuthorizationPolicies(pkg, "authservice", IstioState.Ambient);
    // Expect two policies
    expect(policies.length).toBe(2);
    const nsPolicy = policies.find(
      p => p.metadata?.name === "protect-authservice-ingress-all-pods-intranamespace",
    );
    expect(nsPolicy).toBeDefined();
    expect(nsPolicy!.metadata?.namespace).toBe("authservice");
    expect(nsPolicy!.spec?.action).toBe(Action.Allow);
    expect(nsPolicy!.spec?.rules).toEqual(
      expect.arrayContaining([{ from: [{ source: { namespaces: ["authservice"] } }] }]),
    );

    const workloadPolicy = policies.find(
      p => p.metadata?.name === "protect-authservice-ingress-protected-apps",
    );
    expect(workloadPolicy).toBeDefined();
    expect(workloadPolicy!.spec?.selector?.matchLabels).toEqual({
      "app.kubernetes.io/name": "authservice",
    });
    expect(workloadPolicy!.spec?.action).toBe(Action.Allow);
    expect(workloadPolicy!.spec?.rules).toEqual(
      expect.arrayContaining([{ to: [{ operation: { ports: ["10003"] } }] }]),
    );
  });

  test("should generate correct AuthorizationPolicies for Sidecar Authservice", async () => {
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

    const policies = await generateAuthorizationPolicies(pkg, "authservice", IstioState.Sidecar);
    // Expect three policies
    expect(policies.length).toBe(3);
    const nsPolicy = policies.find(
      p => p.metadata?.name === "protect-authservice-ingress-all-pods-intranamespace",
    );
    expect(nsPolicy).toBeDefined();
    expect(nsPolicy!.metadata?.namespace).toBe("authservice");
    expect(nsPolicy!.spec?.action).toBe(Action.Allow);
    expect(nsPolicy!.spec?.rules).toEqual(
      expect.arrayContaining([{ from: [{ source: { namespaces: ["authservice"] } }] }]),
    );

    const workloadPolicy = policies.find(
      p => p.metadata?.name === "protect-authservice-ingress-protected-apps",
    );
    expect(workloadPolicy).toBeDefined();
    expect(workloadPolicy!.spec?.selector?.matchLabels).toEqual({
      "app.kubernetes.io/name": "authservice",
    });
    expect(workloadPolicy!.spec?.action).toBe(Action.Allow);
    expect(workloadPolicy!.spec?.rules).toEqual(
      expect.arrayContaining([{ to: [{ operation: { ports: ["10003"] } }] }]),
    );

    const metricScrapingPolicy = policies.find(
      p => p.metadata?.name === "protect-authservice-ingress-15020-sidecar-metric-scraping",
    );
    expect(metricScrapingPolicy).toBeDefined();
    expect(metricScrapingPolicy!.spec?.selector?.matchLabels).toEqual({});
    expect(metricScrapingPolicy!.spec?.action).toBe(Action.Allow);
    expect(metricScrapingPolicy!.spec?.rules).toEqual(
      expect.arrayContaining([
        {
          from: [
            {
              source: {
                principals: ["cluster.local/ns/monitoring/sa/kube-prometheus-stack-prometheus"],
              },
            },
          ],
          to: [{ operation: { ports: ["15020"] } }],
        },
      ]),
    );
  });

  test("should generate correct AuthorizationPolicies for Prometheus-Stack", async () => {
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

    const policies = await generateAuthorizationPolicies(pkg, "monitoring", IstioState.Ambient);
    // Expect three policies
    expect(policies.length).toBe(3);
    const nsPolicy = policies.find(
      p => p.metadata?.name === "protect-prometheus-stack-ingress-all-pods-intranamespace",
    );
    expect(nsPolicy).toBeDefined();
    expect(nsPolicy!.metadata?.namespace).toBe("monitoring");
    expect(nsPolicy!.spec?.action).toBe(Action.Allow);
    expect(nsPolicy!.spec?.rules).toEqual(
      expect.arrayContaining([{ from: [{ source: { namespaces: ["monitoring"] } }] }]),
    );

    const promPolicy = policies.find(
      p => p.metadata?.name === "protect-prometheus-stack-ingress-prometheus-grafana-grafana",
    );
    expect(promPolicy).toBeDefined();
    expect(promPolicy!.spec?.selector?.matchLabels).toEqual({
      "app.kubernetes.io/name": "prometheus",
    });
    expect(promPolicy!.spec?.action).toBe(Action.Allow);
    expect(promPolicy!.spec?.rules).toEqual(
      expect.arrayContaining([
        {
          from: [{ source: { namespaces: ["grafana"] } }],
          to: [{ operation: { ports: ["9090"] } }],
        },
      ]),
    );

    const operatorPolicy = policies.find(
      p => p.metadata?.name === "protect-prometheus-stack-ingress-webhook",
    );
    expect(operatorPolicy).toBeDefined();
    expect(operatorPolicy!.spec?.selector?.matchLabels).toEqual({
      app: "kube-prometheus-stack-operator",
    });
    expect(operatorPolicy!.spec?.action).toBe(Action.Allow);
    expect(operatorPolicy!.spec?.rules).toEqual(
      expect.arrayContaining([{ to: [{ operation: { ports: ["10250"] } }] }]),
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
            selector: { "app.kubernetes.io/name": "grafana" },
            targetPort: 3000,
            portName: "80",
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

    const policies = await generateAuthorizationPolicies(pkg, "grafana", IstioState.Ambient);
    // Expect three policies: one from expose, one from allow, and one monitor policy
    expect(policies.length).toBe(3);
    const exposePolicy = policies.find(
      p => p.metadata?.name === "protect-grafana-ingress-3000-grafana-istio-admin-gateway",
    );
    expect(exposePolicy).toBeDefined();
    expect(exposePolicy!.spec?.selector?.matchLabels).toEqual({
      "app.kubernetes.io/name": "grafana",
    });
    expect(exposePolicy!.spec?.action).toBe(Action.Allow);
    expect(exposePolicy!.spec?.rules).toEqual(
      expect.arrayContaining([
        {
          from: [
            {
              source: {
                principals: ["cluster.local/ns/istio-admin-gateway/sa/admin-ingressgateway"],
              },
            },
          ],
          to: [{ operation: { ports: ["3000"] } }],
        },
      ]),
    );

    const nsPolicy = policies.find(
      p => p.metadata?.name === "protect-grafana-ingress-all-pods-intranamespace",
    );
    expect(nsPolicy).toBeDefined();
    expect(nsPolicy!.metadata?.namespace).toBe("grafana");
    expect(nsPolicy!.spec?.action).toBe(Action.Allow);
    expect(nsPolicy!.spec?.rules).toEqual(
      expect.arrayContaining([
        {
          from: [{ source: { namespaces: ["grafana"] } }],
          to: [{ operation: { ports: ["3000"] } }],
        },
      ]),
    );

    const monitorPolicy = policies.find(
      p => p.metadata?.name === "protect-grafana-monitor-3000-grafana-workload",
    );
    expect(monitorPolicy).toBeDefined();
    expect(monitorPolicy!.metadata?.namespace).toBe("grafana");
    expect(monitorPolicy!.spec?.action).toBe(Action.Allow);
    expect(monitorPolicy!.spec?.selector?.matchLabels).toEqual({
      "app.kubernetes.io/name": "grafana",
    });
    expect(monitorPolicy!.spec?.rules).toEqual(
      expect.arrayContaining([
        {
          from: [
            {
              source: {
                principals: ["cluster.local/ns/monitoring/sa/kube-prometheus-stack-prometheus"],
              },
            },
          ],
          to: [{ operation: { ports: ["3000"] } }],
        },
      ]),
    );
  });

  test("should generate correct AuthorizationPolicies for Keycloak", async () => {
    const pkg: UDSPackage = {
      metadata: { name: "keycloak", namespace: "keycloak", generation: 1 },
      spec: {
        monitor: [
          {
            description: "Metrics",
            podSelector: { "app.kubernetes.io/name": "keycloak" },
            selector: {
              "app.kubernetes.io/name": "keycloak",
              "app.kubernetes.io/component": "http",
            },
            targetPort: 9000,
            portName: "http-metrics",
          },
        ],
        network: {
          allow: [
            {
              description: "UDS Operator",
              direction: Direction.Ingress,
              selector: { "app.kubernetes.io/name": "keycloak" },
              remoteNamespace: "pepr-system",
              remoteSelector: { app: "pepr-uds-core-watcher" },
              port: 8080,
            },
            {
              description: "Keycloak backchannel access",
              direction: Direction.Ingress,
              selector: { "app.kubernetes.io/name": "keycloak" },
              remoteNamespace: "*",
              port: 8080,
            },
            {
              description: "OCSP Lookup",
              direction: Direction.Egress,
              selector: { "app.kubernetes.io/name": "keycloak" },
              ports: [443, 80],
              remoteGenerated: RemoteGenerated.Anywhere,
            },
          ],
          expose: [
            {
              description: "remove private paths from public gateway",
              host: "sso",
              service: "keycloak-http",
              selector: { "app.kubernetes.io/name": "keycloak" },
              port: 8080,
              advancedHTTP: {
                match: [
                  { name: "redirect-welcome", uri: { exact: "/" } },
                  { name: "redirect-admin", uri: { prefix: "/admin" } },
                  { name: "redirect-master-realm", uri: { prefix: "/realms/master" } },
                  { name: "redirect-metrics", uri: { prefix: "/metrics" } },
                ],
                redirect: { uri: "/realms/uds/account" },
                headers: {
                  request: {
                    remove: ["istio-mtls-client-certificate"],
                    add: { "istio-mtls-client-certificate": "%DOWNSTREAM_PEER_CERT%" },
                  },
                },
              },
            },
            {
              description: "public auth access with optional client certificate",
              service: "keycloak-http",
              selector: { "app.kubernetes.io/name": "keycloak" },
              host: "sso",
              port: 8080,
              advancedHTTP: {
                headers: {
                  request: {
                    remove: ["istio-mtls-client-certificate"],
                    add: { "istio-mtls-client-certificate": "%DOWNSTREAM_PEER_CERT%" },
                  },
                },
              },
            },
            {
              description: "admin access with optional client certificate",
              service: "keycloak-http",
              selector: { "app.kubernetes.io/name": "keycloak" },
              gateway: Gateway.Admin,
              host: "keycloak",
              port: 8080,
              advancedHTTP: {
                headers: {
                  request: {
                    remove: ["istio-mtls-client-certificate"],
                    add: { "istio-mtls-client-certificate": "%DOWNSTREAM_PEER_CERT%" },
                  },
                },
              },
            },
          ],
        },
      },
    };

    const policies = await generateAuthorizationPolicies(pkg, "keycloak", IstioState.Ambient);
    // We expect 6 policies
    expect(policies.length).toBe(6);

    // 1. UDS Operator allow rule
    const udsOperatorPol = policies.find(
      p => p.metadata?.name === "protect-keycloak-ingress-uds-operator",
    );
    expect(udsOperatorPol).toBeDefined();
    expect(udsOperatorPol?.spec?.selector?.matchLabels).toEqual({
      "app.kubernetes.io/name": "keycloak",
    });
    expect(udsOperatorPol?.spec?.rules).toEqual(
      expect.arrayContaining([
        {
          from: [{ source: { namespaces: ["pepr-system"] } }],
          to: [{ operation: { ports: ["8080"] } }],
        },
      ]),
    );

    // 2. Keycloak backchannel access allow rule
    const backchannelPol = policies.find(
      p => p.metadata?.name === "protect-keycloak-ingress-keycloak-backchannel-access",
    );
    expect(backchannelPol).toBeDefined();
    expect(backchannelPol?.spec?.selector?.matchLabels).toEqual({
      "app.kubernetes.io/name": "keycloak",
    });
    expect(backchannelPol?.spec?.rules).toEqual(
      expect.arrayContaining([{ to: [{ operation: { ports: ["8080"] } }] }]),
    );

    // 3. Expose rule: remove private paths from public gateway
    const removePathsPol = policies.find(
      p => p.metadata?.name === "protect-keycloak-ingress-8080-keycloak-istio-tenant-gateway",
    );
    expect(removePathsPol).toBeDefined();
    expect(removePathsPol?.spec?.selector?.matchLabels).toEqual({
      "app.kubernetes.io/name": "keycloak",
    });
    expect(removePathsPol?.spec?.rules).toEqual(
      expect.arrayContaining([
        {
          from: [
            {
              source: {
                principals: ["cluster.local/ns/istio-tenant-gateway/sa/tenant-ingressgateway"],
              },
            },
          ],
          to: [{ operation: { ports: ["8080"] } }],
        },
      ]),
    );

    // 4. Expose rule: public auth access with optional client certificate
    const publicAuthPol = policies.find(
      p => p.metadata?.name === "protect-keycloak-ingress-8080-keycloak-istio-tenant-gateway",
    );
    expect(publicAuthPol).toBeDefined();
    expect(publicAuthPol?.spec?.selector?.matchLabels).toEqual({
      "app.kubernetes.io/name": "keycloak",
    });
    expect(publicAuthPol?.spec?.rules).toEqual(
      expect.arrayContaining([
        {
          from: [
            {
              source: {
                principals: ["cluster.local/ns/istio-tenant-gateway/sa/tenant-ingressgateway"],
              },
            },
          ],
          to: [{ operation: { ports: ["8080"] } }],
        },
      ]),
    );

    // 5. Expose rule: admin access with optional client certificate
    const adminAuthPol = policies.find(
      p => p.metadata?.name === "protect-keycloak-ingress-8080-keycloak-istio-admin-gateway",
    );
    expect(adminAuthPol).toBeDefined();
    expect(adminAuthPol?.spec?.selector?.matchLabels).toEqual({
      "app.kubernetes.io/name": "keycloak",
    });
    expect(adminAuthPol?.spec?.rules).toEqual(
      expect.arrayContaining([
        {
          from: [
            {
              source: {
                principals: ["cluster.local/ns/istio-admin-gateway/sa/admin-ingressgateway"],
              },
            },
          ],
          to: [{ operation: { ports: ["8080"] } }],
        },
      ]),
    );

    // 6. Monitor rule: Metrics
    const monitorPol = policies.find(
      p => p.metadata?.name === "protect-keycloak-monitor-9000-keycloak-workload",
    );
    expect(monitorPol).toBeDefined();
    expect(monitorPol?.metadata?.namespace).toBe("keycloak");
    expect(monitorPol?.spec?.action).toBe(Action.Allow);
    expect(monitorPol?.spec?.selector?.matchLabels).toEqual({
      "app.kubernetes.io/name": "keycloak",
    });
    expect(monitorPol?.spec?.rules).toEqual(
      expect.arrayContaining([
        {
          from: [
            {
              source: {
                principals: ["cluster.local/ns/monitoring/sa/kube-prometheus-stack-prometheus"],
              },
            },
          ],
          to: [{ operation: { ports: ["9000"] } }],
        },
      ]),
    );
  });
});

describe("createDenyAllExceptWaypointPolicy", () => {
  test("should create a deny-all policy that only allows traffic from the waypoint", () => {
    const pkg: UDSPackage = {
      metadata: {
        name: "test-app",
        namespace: "test-ns",
        generation: 1,
      },
      spec: {},
    };

    const waypointName = "test-waypoint";
    const appSelector = { app: "test-app" };

    const policy = createDenyAllExceptWaypointPolicy(pkg, waypointName, appSelector);

    // Verify basic policy structure
    expect(policy.apiVersion).toBe("security.istio.io/v1beta1");
    expect(policy.kind).toBe("AuthorizationPolicy");
    expect(policy.metadata?.name).toContain("deny-all-except-waypoint-test-waypoint");
    expect(policy.metadata?.namespace).toBe("test-ns");

    // Verify labels
    expect(policy.metadata?.labels).toEqual({
      "uds/package": "test-app",
      "uds/generation": "1",
      "uds/for": "network",
      "uds/ambient-waypoint": "test-waypoint",
    });

    // Verify spec
    expect(policy.spec?.action).toBe(Action.Deny);
    expect(policy.spec?.selector?.matchLabels).toEqual({ app: "test-app" });

    // Verify deny rule that allows waypoint
    expect(policy.spec?.rules).toHaveLength(1);
    expect(policy.spec?.rules?.[0].from?.[0].source?.notPrincipals).toEqual([
      "cluster.local/ns/test-ns/sa/test-waypoint",
    ]);
  });
});

describe("findMatchingSsoClient", () => {
  test("returns undefined when selector is undefined", () => {
    const pkg: UDSPackage = {
      metadata: { name: "app", namespace: "ns" },
      spec: {
        sso: [{ clientId: "c1", name: "", enableAuthserviceSelector: { app: "a" } }],
        network: { serviceMesh: { mode: Mode.Ambient } },
      },
    };

    expect(
      findMatchingSsoClient(pkg, undefined as unknown as Record<string, string>),
    ).toBeUndefined();
  });

  test("returns undefined when mesh mode is not Ambient", () => {
    const pkg: UDSPackage = {
      metadata: { name: "app", namespace: "ns" },
      spec: {
        sso: [{ clientId: "c1", name: "", enableAuthserviceSelector: { app: "a" } }],
        network: { serviceMesh: { mode: Mode.Sidecar } },
      },
    };

    expect(findMatchingSsoClient(pkg, { app: "a" })).toBeUndefined();
  });

  test("defaults to ambient when serviceMesh.mode is undefined", () => {
    const pkg: UDSPackage = {
      metadata: { name: "app", namespace: "ns" },
      spec: {
        // No serviceMesh block -> defaults to Ambient
        sso: [{ clientId: "c1", name: "", enableAuthserviceSelector: { app: "a" } }],
        network: {},
      },
    };

    expect(findMatchingSsoClient(pkg, { app: "a" })).toMatchObject({ clientId: "c1" });
  });

  test("prefilters to enabled clients only (missing/null/undefined selector are ignored)", () => {
    const pkg: UDSPackage = {
      metadata: { name: "app", namespace: "ns" },
      spec: {
        sso: [
          { clientId: "d1", name: "" },
          { clientId: "d3", name: "", enableAuthserviceSelector: undefined },
        ],
        network: { serviceMesh: { mode: Mode.Ambient } },
      },
    };

    expect(findMatchingSsoClient(pkg, { app: "anything" })).toBeUndefined();
  });

  test("empty SSO selector ({}) matches any provided selector (namespace-wide)", () => {
    const pkg: UDSPackage = {
      metadata: { name: "app", namespace: "ns" },
      spec: {
        sso: [{ clientId: "c1", name: "", enableAuthserviceSelector: {} }],
        network: { serviceMesh: { mode: Mode.Ambient } },
      },
    };

    expect(findMatchingSsoClient(pkg, {})).toMatchObject({ clientId: "c1" });
    expect(findMatchingSsoClient(pkg, { app: "x" })).toMatchObject({ clientId: "c1" });
  });

  test("non-empty SSO selector uses all-label matching semantics", () => {
    const pkg: UDSPackage = {
      metadata: { name: "app", namespace: "ns" },
      spec: {
        sso: [{ clientId: "c1", name: "", enableAuthserviceSelector: { app: "a", tier: "prod" } }],
        network: { serviceMesh: { mode: Mode.Ambient } },
      },
    };

    // Matches only when all labels match
    expect(findMatchingSsoClient(pkg, { app: "a", tier: "prod" })).toMatchObject({
      clientId: "c1",
    });
    // Does not match when only a subset matches
    expect(findMatchingSsoClient(pkg, { tier: "prod" })).toBeUndefined();
  });

  test("two enabled clients both match; first match wins", () => {
    const pkg: UDSPackage = {
      metadata: { name: "app", namespace: "ns" },
      spec: {
        sso: [
          { clientId: "first", name: "", enableAuthserviceSelector: { app: "x", tier: "prod" } },
          { clientId: "second", name: "", enableAuthserviceSelector: { app: "x" } },
        ],
        network: { serviceMesh: { mode: Mode.Ambient } },
      },
    };

    // All-label semantics: with selector { app: "x", tier: "prod" }, both clients match.
    // Order matters: ensure the first matching client is returned.
    expect(findMatchingSsoClient(pkg, { app: "x", tier: "prod" })).toMatchObject({
      clientId: "first",
    });
  });

  test("ordering: {} selector client wins over specific-label client", () => {
    const pkg: UDSPackage = {
      metadata: { name: "app", namespace: "ns" },
      spec: {
        sso: [
          { clientId: "wide", name: "", enableAuthserviceSelector: {} },
          { clientId: "specific", name: "", enableAuthserviceSelector: { app: "x" } },
        ],
        network: { serviceMesh: { mode: Mode.Ambient } },
      },
    };

    // {} means namespace-wide; it matches any provided selector.
    // Verify ordering: the {} client appears first and should win.
    expect(findMatchingSsoClient(pkg, { app: "x" })).toMatchObject({ clientId: "wide" });
  });

  test("empty-string selector value matches only empty-string label", () => {
    const pkg: UDSPackage = {
      metadata: { name: "app", namespace: "ns" },
      spec: {
        sso: [{ clientId: "empty", name: "", enableAuthserviceSelector: { foo: "" } }],
        network: { serviceMesh: { mode: Mode.Ambient } },
      },
    };

    // Exact-value requirement: empty-string label matches only empty-string selector value.
    expect(findMatchingSsoClient(pkg, { foo: "" })).toMatchObject({ clientId: "empty" });
    // Non-empty value should not match empty-string selector value.
    expect(findMatchingSsoClient(pkg, { foo: "bar" })).toBeUndefined();
    // Empty provided selector has no keys -> no labels to match -> no match.
    expect(findMatchingSsoClient(pkg, {})).toBeUndefined();
  });
});
