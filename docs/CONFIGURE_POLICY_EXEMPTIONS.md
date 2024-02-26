## Configuring UDS-CORE Policy Exemptions

By default policy exemptions ([UDSExemptions](../src/pepr/operator/crd/generated/exemption-v1alpha1.ts)) are only allowed in a single namespace -- `uds-policy-exemptions`. While this is an anti-pattern for how CRDs typically work in Kubernetes, we believe this is a best practice for these reasons:

- makes maintaining rbac for controlling exemptions easier
- reduces the risk that an unintentional mis-configuration of rbac allows a cluster exemption that would otherwise be denied
- increases organization for cluster management, monitoring, and reporting
- promotes a flow or process of approval

## Allow All Namespaces

If you believe that the default scoping is not the right approach for your cluster, you can configure UDS-CORE at deploy time to allow exemption CRs in all namespaces.

`zarf package deploy zarf-package-uds-core-*.zst --set ALLOW_ALL_NS_EXEMPTIONS=true`

or via a uds bundle config:

uds-config.yaml
```yaml
options:
  # options here

shared:
   ALLOW_ALL_NS_EXEMPTIONS: "true"

variables:
 # package specific variables here

```