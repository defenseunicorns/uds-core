---
title: Authorization Policies in Ambient Mode
sidebar:
  order: 2
---

## Overview

In an ambient mode service mesh environment, security is enforced using Istio AuthorizationPolicies. The UDS‑Core operator automatically generates these **ALLOW** policies based on your UDSPackage configuration. The generated policies ensure that only explicitly permitted traffic is allowed, enforcing per‑port access control for your applications. In addition to handling custom ingress rules (allow/expose), the operator also processes monitor configurations to protect monitoring endpoints (such as Prometheus metrics).

## Policy Generation Process

Authorization policies are dynamically created from the UDSPackage configuration through the following steps:

1. **Identify Applicable Rules:**
   - The operator processes three sections from the UDSPackage:
     - **Allow Rules:** Custom network rules defined under `spec.network.allow`.
     - **Expose Rules:** Rules defined under `spec.network.expose` for exposing services on an Istio Gateway.
     - **Monitor Rules:** Rules defined under `spec.monitor` to secure monitoring endpoints.
   - Even if a rule does not specify any port, a policy is generated—resulting in a rule with only a `from` clause that applies namespace-wide.

2. **Process Allow Rules:**
   - Each rule in `spec.network.allow` is evaluated to determine its target ports (if provided) and remote source attributes:
     - If `remoteGenerated` is set to **IntraNamespace**, the source is set to the package’s namespace.
     - If a non‑empty, non‑asterisk `remoteNamespace` is provided, that namespace is used as the source.
     - If `remoteNamespace` is `"*"` or if `remoteGenerated` is set to **Anywhere**, the source is defined using a negative match (i.e. traffic from any namespace except the package’s namespace).
     - If `remoteServiceAccount` is provided, it overrides the namespace-based source by specifying a principal of the form `cluster.local/ns/<namespace>/sa/<serviceAccount>`.

3. **Process Expose Rules:**
   - Rules in `spec.network.expose` are processed similarly:
     - For expose rules, if `targetPort` is defined it is used; otherwise the rule falls back to using `port`.
     - If the gateway is **Admin**, the source is explicitly set to `{ namespaces: ["istio-admin-gateway"] }`; otherwise, the source defaults to the package’s namespace.

4. **Process Monitor Rules:**
   - Each monitor entry in `spec.monitor` is processed separately.
   - A monitor rule must provide a valid selector (or podSelector) and a targetPort.
   - For each monitor, an individual AuthorizationPolicy is created to restrict access (typically from the `monitoring` namespace) to the specified port (e.g. for Prometheus metrics).

5. **Group and Create Policies:**
   - **Grouping by Selector:**
     Rules that include a pod selector (i.e. a `selector` field) are grouped together using a canonicalization process. This ensures that rules with the same key‑value pairs (regardless of order) are combined into a single workload‑specific policy.
     - For each group, a unique workload AuthorizationPolicy is generated. The policy name is derived from the package name and the selector:
       - If the selector includes an `"app"` key, its value (with any trailing `-pod` removed) is used.
       - Otherwise, if `"app.kubernetes.io/name"` is provided, its value (with `-pod` removed and `-workload` appended) is used.
       - If neither key is present, the fallback name is `"workload"`.
   - **Namespace‑Wide Policy:**
     Rules that do not include a selector are merged into a single namespace‑wide policy.
   - **Monitor Policies:**
     Each monitor entry produces its own AuthorizationPolicy that protects the designated metrics endpoint.

6. **Policy Structure:**
   - Each generated policy uses the **ALLOW** action.
     - If port information is provided, the rule includes a `to` clause that specifies the allowed ports.
     - If no ports are defined, the rule contains only a `from` clause.
   - Metadata labels (including the package name and generation) are added for traceability.

## Example Use Cases

### Example 1: Allow Ingress from a Specific Namespace (No Selector)

**UDSPackage Configuration:**
```yaml
spec:
  network:
    allow:
      - direction: Ingress
        remoteNamespace: "external-app"
        port: 8080
```

**Generated AuthorizationPolicy:**
```yaml
apiVersion: security.istio.io/v1beta1
kind: AuthorizationPolicy
metadata:
  name: protect-my-app-ns
  namespace: my-app-namespace
  labels:
    uds/package: my-app
    uds/generation: "1"
spec:
  action: ALLOW
  rules:
    - from:
        - source:
            namespaces: ["external-app"]
      to:
        - operation:
            ports: ["8080"]
```

### Example 2: Allow Ingress Only to a Specific Pod Selector

**UDSPackage Configuration:**
```yaml
spec:
  network:
    allow:
      - direction: Ingress
        remoteNamespace: "external-app"
        selector:
          app: "frontend"
        port: 8080
```

**Generated AuthorizationPolicy:**
```yaml
apiVersion: security.istio.io/v1beta1
kind: AuthorizationPolicy
metadata:
  name: protect-my-app-frontend
  namespace: my-app-namespace
  labels:
    uds/package: my-app
    uds/generation: "1"
spec:
  action: ALLOW
  selector:
    matchLabels:
      app: "frontend"
  rules:
    - from:
        - source:
            namespaces: ["external-app"]
      to:
        - operation:
            ports: ["8080"]
```

### Example 3: Intra-Namespace Rule Without Port
**UDSPackage Configuration (for a package named "loki" in the "loki" namespace):**

```yaml
spec:
  network:
    allow:
      - direction: Ingress
        remoteGenerated: IntraNamespace
```

**Generated AuthorizationPolicy:**

```yaml
apiVersion: security.istio.io/v1beta1
kind: AuthorizationPolicy
metadata:
  name: protect-loki-ns
  namespace: loki
  labels:
    uds/package: loki
    uds/generation: "1"
spec:
  action: ALLOW
  rules:
    - from:
        - source:
            namespaces: ["loki"]
```

### Example 4: Merging Multiple Rules with the Same Selector
**UDSPackage Configuration:**

```yaml
spec:
  network:
    allow:
      - direction: Ingress
        remoteGenerated: Anywhere
        selector:
          app: "my-app"
        port: 80
      - direction: Ingress
        remoteGenerated: Anywhere
        selector:
          app: "my-app"
        port: 443
```

**Generated AuthorizationPolicy (for a package named "myapp" in the "my-namespace" namespace):**
```yaml
apiVersion: security.istio.io/v1beta1
kind: AuthorizationPolicy
metadata:
  name: protect-myapp-my-app
  namespace: my-namespace
  labels:
    uds/package: my-app
    uds/generation: "1"
spec:
  action: ALLOW
  selector:
    matchLabels:
      app: "my-app"
  rules:
    - from:
        - source:
            notNamespaces: ["my-namespace"]
      to:
        - operation:
            ports: ["80", "443"]
```

### Example 5: Monitor Rule for Securing a Metrics Endpoint
**UDSPackage Configuration:**

```yaml
spec:
  monitor:
    - description: Metrics
      podSelector:
        app.kubernetes.io/name: grafana
      portName: service
      selector:
        app.kubernetes.io/name: grafana
      targetPort: 3000
```

**Generated AuthorizationPolicy:**
```yaml
apiVersion: security.istio.io/v1beta1
kind: AuthorizationPolicy
metadata:
  name: protect-grafana-monitor-grafana-workload
  namespace: grafana
  labels:
    uds/package: grafana
    uds/generation: "1"
spec:
  action: ALLOW
  selector:
    matchLabels:
      app.kubernetes.io/name: grafana
  rules:
    - from:
        - source:
            namespaces: ["monitoring"]
      to:
        - operation:
            ports: ["3000"]
```

## Summary
- The UDS‑Core operator automatically generates ALLOW Istio AuthorizationPolicies based on your UDSPackage configuration.

- Policies are generated for rules defined in the allow, expose, and monitor blocks.

- Rules with pod selectors result in workload‑specific policies, while rules without selectors are merged into a single namespace‑wide policy.

- Each monitor entry produces its own policy, ensuring that monitoring endpoints (e.g. metrics) are secured.

- If port information is provided, policies enforce allowed ports; if not, they only include a from clause.

- Metadata is added for traceability.
