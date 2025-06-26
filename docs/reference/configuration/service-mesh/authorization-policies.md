---
title: How Authorization Policies Protect Your Services
---

In clusters running Istio Ambient Mesh, UDS Core partially enforces **ingress network security** using Istio **ALLOW** AuthorizationPolicies. These policies are automatically generated for each application package you define with a [UDS Package](https://uds.defenseunicorns.com/reference/configuration/uds-operator/package/) resource.

This document explains what this means for you as an application developer and how to take full advantage of the built-in security model.

## Key Takeaways

- **Ingress is denied by default.** UDS Core only allows what you explicitly configure using `allow` and `expose` rules.
- **AuthorizationPolicies are ALLOW-based**, which means you must write **DENY** rules separately if you want to restrict internal traffic further.
- **Use `remoteServiceAccount` wherever possible.** This provides the most secure and identity-based access control.
- **Expose rules use gateways** to control what traffic enters your application. You can choose between:
  - **Tenant Gateway** (default)
  - **Admin Gateway** (used for admin functions)
- **Monitoring ports are automatically secured** using rules that only allow the `monitoring` namespace to scrape metrics.
- **`PERMISSIVE` Traffic** can be allowed by adding custom **ALLOW** Authorization Policies layered on top of the default provided policies

## Best Practices for Secure Configuration

### 1. Lock Down Ingress With `allow`

```yaml
spec:
  network:
    allow:
      - direction: Ingress
        remoteNamespace: "external-app"
        remoteServiceAccount: "my-client"
        port: 8080
```

> This ensures that only a workload running as this specific service account in another namespace can access your service.

### 2. Expose Your Service Safely

```yaml
spec:
  network:
    expose:
      - port: 80
        targetPort: 8080
        gateway: Tenant
```

> This exposes your service at port 80 through the tenant gateway and maps it to your app’s port 8080.

### 3. Enable Safe Monitoring

```yaml
spec:
  monitor:
    - targetPort: 3000
      selector:
        app.kubernetes.io/name: grafana
```

> This creates a rule that allows only Prometheus (from the `monitoring` namespace) to scrape your service.

## Permissive Traffic and Traffic Outside the Mesh

By default UDS Core includes all ports for all workloads in the service mesh, running with `STRICT` mTLS which provides an ideal security posture. However, certain applications may need to allow `PERMISSIVE` traffic and/or exclude certain ports/workloads from the mesh entirely. In these cases you can apply more permissive policies at varying scopes. Keep in mind that UDS Core provides defense in depth so network policies will still govern/restrict traffic in most cases, however Authorization Policies are necessary to full restrict traffic on a per-port basis in Istio's Ambient Mesh. 

Below are four approaches to effectively "opt-out" from Authorization Policy enforcement patterns, with different scopes depending on your needs:

1. **Workload-Scoped Port Opt-Out (Least Permissive)**
   Apply an `ALLOW` rule for a specific port on a given workload:

   ```yaml
   apiVersion: security.istio.io/v1
   kind: AuthorizationPolicy
   metadata:
     name: permissive-ap-workload-port
     namespace: <package-namespace>
   spec:
     action: ALLOW
     selector:
       matchLabels:
         selector: for-app # Your workload selector here
     rules:
     - to:
       - operation:
           ports:
           - "1234"
   ```

2. **Workload-Scoped Opt-Out**
   Apply an `ALLOW` rule to all ports for a specific workload:

   ```yaml
   apiVersion: security.istio.io/v1
   kind: AuthorizationPolicy
   metadata:
     name: permissive-ap-workload
     namespace: <package-namespace>
   spec:
     action: ALLOW
     selector:
       matchLabels:
         selector: for-app # Your workload selector here
     rules:
     - {}
   ```

3. **Namespace-Scoped Opt-Out**
   Apply an `ALLOW` rule to all workloads within a specific namespace:

   ```yaml
   apiVersion: security.istio.io/v1
   kind: AuthorizationPolicy
   metadata:
     name: permissive-ap-namespace
     namespace: <package-namespace>
   spec:
     action: ALLOW
     rules:
     - {}
   ```

4. **Mesh-Wide Opt-Out (Most Permissive)**
   Apply an `ALLOW` rule cluster-wide (in the `istio-system` namespace), effectively disabling `ALLOW` AuthorizationPolicies everywhere and relying on network policies or optional `DENY` rules:

   ```yaml
   apiVersion: security.istio.io/v1
   kind: AuthorizationPolicy
   metadata:
     name: permissive-ap-mesh
     namespace: istio-system
   spec:
     action: ALLOW
     rules:
     - {}
   ```

:::note
The UDS Core operator will still generate its standard AuthorizationPolicies, but these `ALLOW` rules ensure that traffic from outside the mesh is allowed without disruption. Always use the least permissive scope possible to minimize risk.
:::

## How Istio Evaluates Policies

Istio checks **DENY policies first**, then **ALLOW policies**.

- The operator creates ALLOW policies to admit approved ingress traffic.
- You should create your own DENY policies for more fine-grained control.

More info: [Istio Authorization Policy Evaluation](https://istio.io/latest/docs/concepts/security/#authorization-policy)

## Summary

- Ingress is denied by default.
- You allow ingress by defining `allow` or `expose` rules in your UDS Package resource definition.
- You can further tighten security using DENY policies.
- Use `remoteServiceAccount` for the strongest protection.
- `PERMISSIVE` traffic will require additional authorization policies.
