/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { Direction, Gateway, RemoteGenerated, UDSPackage } from "../../crd";
import { Action } from "../../crd/generated/istio/authorizationpolicy-v1beta1";
import { generateAuthorizationPolicies } from "./authorizationPolicies";

describe("generateAuthorizationPolicies", () => {
  test("should generate correct policies for Neuvector", async () => {
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
            // IntraNamespace rules with no port info are skipped.
            { direction: Direction.Ingress, remoteGenerated: RemoteGenerated.IntraNamespace },
            { direction: Direction.Egress, remoteGenerated: RemoteGenerated.IntraNamespace },
            // This allow rule has a selector and a port.
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
    expect(policies.length).toBe(2);

    // Workload policy from the allow rule.
    const controllerPolicy = policies.find(
      p => p.metadata?.name === "protect-neuvector-neuvector-controller",
    );
    expect(controllerPolicy).toBeDefined();
    expect(controllerPolicy?.spec?.selector?.matchLabels).toEqual({
      app: "neuvector-controller-pod",
    });
    expect(controllerPolicy?.spec?.action).toBe(Action.Deny);
    expect(controllerPolicy?.spec?.rules).toEqual(
      expect.arrayContaining([
        {
          from: [{ source: { notNamespaces: ["neuvector"] } }],
          to: [{ operation: { notPorts: ["30443"] } }],
        },
      ]),
    );

    // Workload policy from the expose rule.
    const managerPolicy = policies.find(
      p => p.metadata?.name === "protect-neuvector-neuvector-manager",
    );
    expect(managerPolicy).toBeDefined();
    expect(managerPolicy?.spec?.selector?.matchLabels).toEqual({ app: "neuvector-manager-pod" });
    expect(managerPolicy?.spec?.action).toBe(Action.Deny);
    expect(managerPolicy?.spec?.rules).toEqual(
      expect.arrayContaining([
        {
          from: [{ source: { namespaces: ["istio-admin-gateway"] } }],
          to: [{ operation: { notPorts: ["8443"] } }],
        },
      ]),
    );
  });

  test("should generate a namespace policy when no selectors are provided", async () => {
    const pkg: UDSPackage = {
      metadata: { name: "metrics-server", namespace: "metrics-server", generation: 1 },
      spec: {
        network: {
          allow: [
            {
              direction: Direction.Egress,
              // No selector provided: this rule will go into the namespace policy.
              port: 10250,
              remoteGenerated: RemoteGenerated.Anywhere,
            },
          ],
        },
      },
    };

    const policies = await generateAuthorizationPolicies(pkg);
    expect(policies.length).toBe(1);
    const nsPolicy = policies[0];
    expect(nsPolicy.metadata?.name).toBe("protect-metrics-server-ns");
    expect(nsPolicy.metadata?.namespace).toBe("metrics-server");
    expect(nsPolicy.spec?.action).toBe(Action.Deny);
    expect(nsPolicy.spec?.rules).toEqual(
      expect.arrayContaining([
        {
          from: [{ source: { notNamespaces: ["metrics-server"] } }],
          to: [{ operation: { notPorts: ["10250"] } }],
        },
      ]),
    );
  });

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
    expect(policy.spec?.rules).toEqual(
      expect.arrayContaining([
        {
          from: [{ source: { notNamespaces: ["my-namespace"] } }],
          to: [{ operation: { notPorts: expect.arrayContaining(["80", "443"]) } }],
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
    expect(policy.spec?.rules).toEqual(
      expect.arrayContaining([
        {
          from: [{ source: { principals: ["cluster.local/ns/authservice/sa/custom-sa"] } }],
          to: [{ operation: { notPorts: ["10003"] } }],
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
    expect(policy.spec?.rules?.length).toBe(2);
    expect(policy.spec?.rules).toEqual(
      expect.arrayContaining([
        {
          from: [{ source: { namespaces: ["other-namespace"] } }],
          to: [{ operation: { notPorts: ["3000"] } }],
        },
        {
          from: [{ source: { notNamespaces: ["test-namespace"] } }],
          to: [{ operation: { notPorts: ["4000"] } }],
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
    expect(policy.spec?.rules).toEqual(
      expect.arrayContaining([
        {
          from: [{ source: { notNamespaces: ["multi-ns"] } }],
          to: [{ operation: { notPorts: expect.arrayContaining(["8080", "9090"]) } }],
        },
      ]),
    );
  });

  test("should skip rules with no port information", async () => {
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
    expect(policies.length).toBe(0);
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
    // With no "app" label, derivePolicyName should use the "app.kubernetes.io/name" value.
    // "example-pod" becomes "example-workload"
    expect(policies.length).toBe(1);
    expect(policies[0].metadata?.name).toBe("protect-testpkg-example-workload");
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
              // No remoteNamespace, remoteGenerated, or remoteServiceAccount provided.
            },
          ],
        },
      },
    };

    const policies = await generateAuthorizationPolicies(pkg);
    expect(policies.length).toBe(1);
    // Expect the rule's source to be { namespaces: ["defaultns"] } due to the final else branch.
    expect(policies[0].spec?.rules).toEqual(
      expect.arrayContaining([
        {
          from: [{ source: { namespaces: ["defaultns"] } }],
          to: [{ operation: { notPorts: ["80"] } }],
        },
      ]),
    );
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
          to: [{ operation: { notPorts: ["8081"] } }],
        },
      ]),
    );
  });

  test("should derive policy name using app.kubernetes.io/name when app is missing", async () => {
    // In this package, the selector does not contain "app" but does contain "app.kubernetes.io/name".
    // The expected derived name is "example-workload" so the policy name should be "protect-testpkg-example-workload".
    const pkg: UDSPackage = {
      metadata: { name: "testpkg", namespace: "testns", generation: 1 },
      spec: {
        network: {
          allow: [
            {
              direction: Direction.Ingress,
              selector: { "app.kubernetes.io/name": "example-pod" },
              port: 1234,
            },
          ],
        },
      },
    };

    const policies = await generateAuthorizationPolicies(pkg);
    expect(policies.length).toBe(1);
    expect(policies[0].metadata?.name).toBe("protect-testpkg-example-workload");
  });

  test("should default source to package namespace for allow rules when no remote info is provided", async () => {
    // In this allow rule, no remote information is provided.
    // The source should default to the package's namespace.
    const pkg: UDSPackage = {
      metadata: { name: "defaultsrc", namespace: "defaultns", generation: 1 },
      spec: {
        network: {
          allow: [
            {
              direction: Direction.Ingress,
              selector: { app: "default-app" },
              port: 80,
              // No remoteNamespace, remoteGenerated, or remoteServiceAccount provided.
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
          to: [{ operation: { notPorts: ["80"] } }],
        },
      ]),
    );
  });

  test("should use package namespace as source for expose rules when gateway is not Admin", async () => {
    // For expose rules, if the gateway is not Admin, the source should default to the package namespace.
    const pkg: UDSPackage = {
      metadata: { name: "exposeTest", namespace: "exposeNs", generation: 1 },
      spec: {
        network: {
          expose: [
            {
              service: "test-service",
              selector: { foo: "bar" },
              gateway: Gateway.Tenant, // Not Admin, so falls to else branch.
              host: "test.example.com",
              port: 8080,
            },
          ],
        },
      },
    };

    const policies = await generateAuthorizationPolicies(pkg);
    expect(policies.length).toBe(1);
    // Since selector { foo: "bar" } does not have "app" or "app.kubernetes.io/name",
    // the derivePolicyName fallback returns "workload" and the policy name becomes "protect-exposeTest-workload".
    expect(policies[0].metadata?.name).toBe("protect-exposeTest-workload");
    expect(policies[0].spec?.rules).toEqual(
      expect.arrayContaining([
        {
          from: [{ source: { namespaces: ["exposeNs"] } }],
          to: [{ operation: { notPorts: ["8080"] } }],
        },
      ]),
    );
  });

  test("should merge multiple expose rules with the same selector and gateway", async () => {
    // Two expose rules with the same selector and with gateway Admin (so they share the same source).
    // Their ports should be merged.
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
    // Since both expose rules have the same selector and the same gateway (Admin),
    // they should be merged into one workload policy.
    expect(policies.length).toBe(1);
    const policy = policies[0];
    // derivePolicyName({ app: "merge-app" }) returns "merge-app"
    expect(policy.metadata?.name).toBe("protect-exposeMerge-merge-app");
    // The source should be forced to "istio-admin-gateway" for expose rules when gateway is Admin.
    expect(policy.spec?.rules).toEqual(
      expect.arrayContaining([
        {
          from: [{ source: { namespaces: ["istio-admin-gateway"] } }],
          to: [{ operation: { notPorts: expect.arrayContaining(["8000", "9000"]) } }],
        },
      ]),
    );
  });

  test("should generate allow rule with remoteGenerated IntraNamespace using package namespace", async () => {
    // An allow rule with remoteGenerated IntraNamespace and a port should yield source { namespaces: [pkgNamespace] }
    const pkg: UDSPackage = {
      metadata: { name: "intraapp", namespace: "intra-ns", generation: 1 },
      spec: {
        network: {
          allow: [
            {
              direction: Direction.Ingress,
              remoteGenerated: RemoteGenerated.IntraNamespace,
              selector: { app: "intra-app" },
              port: 7070,
            },
          ],
        },
      },
    };

    const policies = await generateAuthorizationPolicies(pkg);
    expect(policies.length).toBe(1);
    const policy = policies[0];
    // Expect the source to be the package namespace
    expect(policy.spec?.rules).toEqual(
      expect.arrayContaining([
        {
          from: [{ source: { namespaces: ["intra-ns"] } }],
          to: [{ operation: { notPorts: ["7070"] } }],
        },
      ]),
    );
  });
});
