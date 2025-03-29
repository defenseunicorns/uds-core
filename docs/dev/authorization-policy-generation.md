## Overview

This guide describes how Istio AuthorizationPolicies are generated from the UDSPackage CR by the UDS‑Core operator. These **ALLOW** policies are primarily used to enable ingress security within an Istio Ambient Mesh environment.

The code responsible for generating these policies can be found in the Pepr policy implementation and includes support for three rule types:
- `allow`: Direct ingress rules for services.
- `expose`: Gateway-based ingress exposure.
- `monitor`: Restricts access to metrics endpoints.

Each rule is processed individually to generate a single Istio AuthorizationPolicy.

---

## Policy Generation Flow

1. **Input Collection**
   - The operator reads the `spec.network.allow`, `spec.network.expose`, and `spec.monitor` fields from a UDSPackage.

2. **Allow Rule Processing**
   - Sources are computed based on `remoteGenerated`, `remoteNamespace`, and `remoteServiceAccount`.
   - Port info is collected from `port` and `ports`.
   - If `remoteServiceAccount` is present, a `principal` source is used, overriding namespace restrictions.

3. **Expose Rule Processing**
   - Uses `port` or `targetPort` for port resolution.
   - Sources are determined by the selected gateway:
     - Admin gateway → `cluster.local/ns/istio-admin-gateway/sa/admin-ingressgateway`
     - Tenant gateway (default) → `cluster.local/ns/istio-tenant-gateway/sa/tenant-ingressgateway`

4. **Monitor Rule Processing**
   - Each monitor rule generates a policy allowing access from `monitoring` namespace to a specific port.

5. **Policy Naming**
   - All policies start with `protect-<pkgName>-<rule-derived-name>`.
   - `allow` rules use either the `description` or a combination of selector and remote fields.
   - `expose` rules follow `ingress-<port>-<selector>-istio-<gateway>-gateway`.

6. **Policy Application**
   - Policies are applied via `K8s(AuthorizationPolicy).Apply()` with force enabled.
   - `purgeOrphans` removes outdated or unused policies from previous generations.

---

## Development Tips

- **Rule Deduplication**: Currently, even identical selectors in different rules generate separate policies.
- **Troubleshooting**: Enable debug logging to inspect which policy is generated and applied.
- **Testing**: Use test UDSPackages with different `remoteGenerated` and gateway values to validate behavior.
- **Best Practices**:
  - Avoid overly broad allow rules (e.g., `remoteGenerated: Anywhere`) unless absolutely necessary.
  - Prefer using `remoteServiceAccount` for precise identity-based access.

---

## Example Use Cases

### Example 1: Allow Ingress from a Specific Namespace (No Selector)

```yaml
spec:
  network:
    allow:
      - direction: Ingress
        remoteNamespace: "external-app"
        port: 8080
```

```yaml
apiVersion: security.istio.io/v1beta1
kind: AuthorizationPolicy
metadata:
  name: protect-my-app-ingress-external-app
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

```yaml
apiVersion: security.istio.io/v1beta1
kind: AuthorizationPolicy
metadata:
  name: protect-my-app-ingress-frontend
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

```yaml
spec:
  network:
    allow:
      - direction: Ingress
        remoteGenerated: IntraNamespace
```

```yaml
apiVersion: security.istio.io/v1beta1
kind: AuthorizationPolicy
metadata:
  name: protect-loki-ingress-all
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

### Example 4: Allow Anywhere Rule (No Namespace Restriction)

```yaml
spec:
  network:
    allow:
      - direction: Ingress
        remoteGenerated: Anywhere
        port: 80
```

```yaml
apiVersion: security.istio.io/v1beta1
kind: AuthorizationPolicy
metadata:
  name: protect-myapp-ingress-all
  namespace: my-namespace
  labels:
    uds/package: myapp
    uds/generation: "1"
spec:
  action: ALLOW
  rules:
    - from: []
      to:
        - operation:
            ports: ["80"]
```

### Example 5: Expose Rule with Gateway Specification

```yaml
spec:
  network:
    expose:
      - port: 8080
        targetPort: 9090
        selector:
          app: "backend"
        gateway: Admin
```

```yaml
apiVersion: security.istio.io/v1beta1
kind: AuthorizationPolicy
metadata:
  name: protect-my-app-ingress-9090-backend-istio-admin-gateway
  namespace: my-app-namespace
  labels:
    uds/package: my-app
    uds/generation: "1"
spec:
  action: ALLOW
  selector:
    matchLabels:
      app: "backend"
  rules:
    - from:
        - source:
            principals: ["cluster.local/ns/istio-admin-gateway/sa/admin-ingressgateway"]
      to:
        - operation:
            ports: ["9090"]
```

### Example 6: Monitor Rule for Securing a Metrics Endpoint

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

```yaml
apiVersion: security.istio.io/v1beta1
kind: AuthorizationPolicy
metadata:
  name: protect-grafana-ingress-grafana-istio-tenant-gateway
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
