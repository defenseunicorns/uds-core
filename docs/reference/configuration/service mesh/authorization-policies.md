---
title: How Authorization Policies Protect Your Services
---

In clusters running Istio Ambient Mesh, UDS‑Core enforces **ingress network security** using Istio **ALLOW** AuthorizationPolicies. These policies are automatically generated for each application package you define with a [UDS Package](https://uds.defenseunicorns.com/reference/configuration/uds-operator/package/) resource.

This document explains what this means for you as an application developer and how to take full advantage of the built-in security model.

---

## Key Takeaways

- **Ingress is denied by default.** UDS Core only allows what you explicitly configure using `allow` and `expose` rules.

- **AuthorizationPolicies are ALLOW-based**, which means you must write **DENY** rules separately if you want to restrict internal traffic further.

- **Use `remoteServiceAccount` wherever possible.** This provides the most secure and identity-based access control.

- **Expose rules use gateways** to control what traffic enters your application. You can choose between:
  - **Tenant Gateway** (default)
  - **Admin Gateway** (used only when absolutely necessary)

- **Monitoring ports are automatically secured** using rules that only allow the `monitoring` namespace to scrape metrics.

---

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

---

## Authservice Guidance

If you're using Authservice, be aware that it is **only appropriate for simple access scenarios**, such as:

- Protecting web UIs or dashboards
- Cases where access can be fully granted or denied with no granularity

---

## How Istio Evaluates Policies

Istio checks **DENY policies first**, then **ALLOW policies**.

- The operator creates ALLOW policies to admit approved ingress traffic.
- You should create your own DENY policies for more fine-grained control.

More info: [Istio Authorization Policy Evaluation](https://istio.io/latest/docs/concepts/security/#authorization-policy)

---

## Summary

- Ingress is denied by default.
- You allow ingress by defining `allow` or `expose` rules in your UDS Package resource definition.
- You can further tighten security using DENY policies.
- Use `remoteServiceAccount` for the strongest protection.
- Authservice is good for simple cases only—use stronger methods for complex needs.

