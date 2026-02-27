---
title: Overview
sidebar:
  order: 1
---

![UDS Operator Overview Flows](https://github.com/defenseunicorns/uds-core/blob/main/docs/.images/diagrams/uds-core-operator-overview.svg?raw=true)

The UDS Operator plays a pivotal role in managing the lifecycle of UDS Package Custom Resources (CRs) along with their associated resources like NetworkPolicies and Istio VirtualServices. Leveraging [Pepr](https://github.com/defenseunicorns/pepr), the operator binds watch operations to the [enqueue and reconciler](https://docs.pepr.dev/main/user-guide/actions/reconcile/), taking on several key responsibilities for UDS Packages and exemptions:

- [UDS Package Docs](https://uds.defenseunicorns.com/reference/configuration/uds-operator/package/)
- [UDS Exemption Docs](https://uds.defenseunicorns.com/reference/configuration/uds-operator/exemption/)

### Ignoring A Namespace

You can ignore one or more namespaces from all operator and policy actions by adding them to Pepr’s ignored namespaces list in a bundle override, like so:

```yaml
packages:
  - name: core
    repository: ghcr.io/defenseunicorns/packages/uds/core
    ref: x.x.x
    overrides:
      pepr-uds-core:
        module:
          values:
            - path: additionalIgnoredNamespaces
              value:
                - foo-system
                - bar-system
```

In the example above, policies would not be enforced on the `foo-system` and `bar-system` namespaces. In addition, any `Package` or `Exemption` custom resources in these namespaces would be ignored and not processed.

:::caution
This should typically only be used for "system" namespaces where you do not want/expect UDS Integration. By ignoring a namespace you are incurring risk as these workloads will run without policy restrictions and likely without other security controls (service mesh, network restrictions, etc). Proper RBAC and auditing around these ignored namespaces is strongly advised.
:::

## Key Files and Folders

```txt
src/pepr/operator/
├── controllers             # Core business logic called by the reconciler
├── crd                     # Custom Resource Definitions for UDS Operator
├── reconcilers             # Reconciles Custom Resources via the controllers
└── index.ts                # Entrypoint for the UDS Operator
```
