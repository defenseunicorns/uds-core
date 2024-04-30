## Configuring UDS-CORE Policy Exemptions

By default policy exemptions ([UDSExemptions](../src/pepr/operator/crd/generated/exemption-v1alpha1.ts)) are only allowed in a single namespace -- `uds-policy-exemptions`. We recognize this is not a conventional pattern in K8s, but believe it is ideal for UDS for the following reasons:

- highlights the fact that an exemption can reduce the overall security posture of the cluster 
- makes maintaining RBAC for controlling exemptions more straightforward
- reduces the risk that an unintentional mis-configuration of RBAC allows a cluster exemption that would otherwise be denied

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

## Handling Pre Core Exemptions

If you find that you are deploying a resource before uds-core that requires an exemption CR once uds-core is deployed there are two options:

1) Pass exemptions to the core `pre-core-exemptions` package as helm values overrides. See [Pre Core Exemptions Docs](../src/pre-core-exemptions/README.md)

2) Deploy the exemption CRD as a package in your bundle before your pre-core resource.
   (e.g.)
   ```yaml
   kind: UDSBundle
   metadata:
     name: example CRD
   
   packages:
     - name: exemption-crd
       repository: ghcr.io/defenseunicorns/packages/uds/exemption-crd
       ref: <same-ref-as-core>
   
     # Where the exemption CR lives
     - name: custom-init
       repository: ghcr.io/custom-init
       ref: v0.1.0

     - name: core
       path: ghcr.io/defenseunicorns/packages/uds/core
       ref: 0.20.0-upstream
   ```
   
> Warning 
>
> Though both options have been tested, there is no guarantee
> that upgrades, specifically to the CRD package and your CR,
> will not break your deployment.