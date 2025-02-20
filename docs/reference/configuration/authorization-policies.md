---
title: Authorization Policies in Ambient Mode
sidebar:
    order: 2
---

## Overview

When deploying applications in an **ambient mode** service mesh environment, security policies are enforced using **Istio AuthorizationPolicies**. These policies are automatically generated and applied by **UDS-Core** using **Pepr**, ensuring that only explicitly allowed ingress traffic is permitted while all other traffic is denied by default.

## Policy Generation Process

Authorization policies are generated dynamically based on the `UDSPackage` configuration. The process follows these key steps:

1. **Determine if the Namespace is Ambient:**
   - If the namespace is not ambient, Pepr falls back to using Kubernetes Network Policies instead of Istio AuthorizationPolicies.

2. **Check for Ingress Rules:**
   - **Only ingress rules** trigger the creation of AuthorizationPolicies.
   - If no ingress rules with valid port mappings exist, no AuthorizationPolicies are generated.

3. **Process Allow Rules:**
   - The package's `spec.network.allow` rules are evaluated.
   - Each rule is classified based on whether it includes a `selector` (targeting specific pods) or applies to the whole namespace.

4. **Group and Create Policies:**
   - If a rule has a **selector**, a unique AuthorizationPolicy is created for that selector.
   - If a rule lacks a **selector**, a separate policy (`deny-no-selector`) is created.
   - **Deny rules** are grouped by port and remote namespace.
   - **NotPorts rules** ensure traffic is properly restricted when no explicit ports are defined.

5. **Apply Policies:**
   - Generated AuthorizationPolicies are applied to the cluster.
   - If no policies are created, Pepr logs that no explicit rules were found and skips AuthorizationPolicy creation.

## Example Use Cases

### **Example 1: Allow Ingress from Specific Namespace**
#### **UDSPackage Configuration:**
```yaml
spec:
  network:
    allow:
      - remoteNamespace: "external-app"
        direction: Ingress
```
#### **Generated AuthorizationPolicy:**
```yaml
apiVersion: security.istio.io/v1beta1
kind: AuthorizationPolicy
metadata:
  name: deny-my-app-no-selector
  namespace: my-app-namespace
spec:
  action: DENY
  rules:
    - from:
        - source:
            notNamespaces: ["external-app"]
```

### **Example 2: Allow Ingress Only to a Specific Pod Selector**
#### **UDSPackage Configuration:**
```yaml
spec:
  network:
    allow:
      - remoteNamespace: "external-app"
        direction: Ingress
        selector:
          app: "frontend"
```
#### **Generated AuthorizationPolicy:**
```yaml
apiVersion: security.istio.io/v1beta1
kind: AuthorizationPolicy
metadata:
  name: deny-my-app-frontend
  namespace: my-app-namespace
spec:
  action: DENY
  rules:
    - from:
        - source:
            notNamespaces: ["external-app"]
      to:
        - operation:
            ports: ["80"]
```

### **Example 3: No Policies Created for Egress-Only Rules**
#### **UDSPackage Configuration:**
```yaml
spec:
  network:
    allow:
      - remoteNamespace: "external-service"
        direction: Egress
```
#### **Result:**
- No AuthorizationPolicies are generated, since only ingress rules trigger policy creation.

## Summary
- **UDS-Core + Pepr** handle **Istio AuthorizationPolicies** automatically in **ambient mode**.
- Policies are only created for **Ingress** rules, ensuring explicit access control.
- Policies are grouped by **selectors** (if present) or applied namespace-wide if no selectors exist.
- **Egress rules do not create AuthorizationPolicies**, relying instead on other networking controls.
- This ensures **zero-trust network security**, where only explicitly allowed traffic is permitted.

By following this model, applications running within an ambient mesh environment maintain a strong security posture while minimizing unnecessary policy overhead.

