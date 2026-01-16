---
title: UDS Exemption
tableOfContents:
  maxHeadingLevel: 4
---

![UDS Operator Exemption Flowchart](https://github.com/defenseunicorns/uds-core/blob/main/docs/.images/diagrams/uds-core-operator-uds-exemption.svg?raw=true)

## Exemption

- **Exemption Scope:**
  - Granting exemption for custom resources is restricted to the `uds-policy-exemptions` namespace by default, unless specifically configured to allow exemptions across all namespaces.
- **Policy Updates:**
  - Updating the policies Pepr store with registered exemptions.

### Example UDS Exemption CR

```yaml
apiVersion: uds.dev/v1alpha1
kind: Exemption
metadata:
  name: my-pods
  namespace: uds-policy-exemptions
spec:
  exemptions:
    - policies:
        - DisallowHostNamespaces
        - DisallowPrivileged
        - RequireNonRootUser
        - DropAllCapabilities
        - RestrictHostPathWrite
        - RestrictVolumeTypes
      matcher:
        namespace: my-pods
        name: "^my-privileged-pod.*"

    - policies:
        - DisallowPrivileged
        - RequireNonRootUser
        - DropAllCapabilities
        - RestrictHostPathWrite
        - RestrictVolumeTypes
      matcher:
        namespace: my-pods
        name: "^my-hostpath-pod.*"

    - policies:
        - DropAllCapabilities
      matcher:
        namespace: my-pods
        name: "^my-exempt-pod.*"
```

:::note
This example may not contain all fields, the full specification for the Exemption CR is documented [here](/reference/configuration/custom-resources/exemptions-v1alpha1-cr). In addition, there is a JSON schema published [here](https://raw.githubusercontent.com/defenseunicorns/uds-core/refs/heads/main/schemas/exemption-v1alpha1.schema.json) for use in your IDE.
:::

### Configuring UDS Core Policy Exemptions

Default [policy exemptions](https://uds.defenseunicorns.com/reference/configuration/custom-resources/exemptions-v1alpha1-cr/) and [namespace restriction/config](https://uds.defenseunicorns.com/reference/configuration/uds-configure-policy-exemptions/) are confined to a singular namespace: `uds-policy-exemptions`. We find this to be an optimal approach for UDS due to the following reasons:

- **Emphasis on Security Impact:**
  - An exemption has the potential to diminish the overall security stance of the cluster. By isolating these exemptions within a designated namespace, administrators can readily recognize and assess the security implications associated with each exemption.
- **Simplified RBAC Maintenance:**
  - Adopting this pattern streamlines the management of Role-Based Access Control (RBAC) for overseeing exemptions. Placing all UDS exemptions within a dedicated namespace simplifies the task of configuring and maintaining RBAC policies, enhancing overall control and transparency.
- **Mitigation of Configuration Risks:**
  - By restricting exemptions to a specific namespace, the risk of unintentional misconfigurations in RBAC is significantly reduced. This ensures that cluster exemptions are only granted intentionally and within the confines of the designated namespace, minimizing the potential for security vulnerabilities resulting from misconfigured permissions.

#### Allow Exemptions In All Namespaces

If you find that the default scoping is not the right approach for your cluster, you have the option to configure `UDS-CORE` at deploy time to allow exemption CRs in all namespaces:

`zarf package deploy zarf-package-uds-core-*.zst --set ALLOW_ALL_NS_EXEMPTIONS=true`

You can also achieve this through the `uds-config.yaml`:

```yaml
options:
  # options here

shared:
   ALLOW_ALL_NS_EXEMPTIONS: "true"

variables:
 # package specific variables here
```

### Deploying Exemptions in UDS Core Installation

In some cases, you may want to deploy custom `Exemption` CRs as part of your UDS Core installation. This can be done by overriding the `uds-exemptions` helm chart which gets applied after pepr is installed.

UDS Core does provide some ready to use exemptions to turn on out of the box. Currently we support exemptions for:
- Enabling Node Port Services on Istio Gateways
    ```yaml
      - name: core
        repository: ghcr.io/defenseunicorns/packages/uds/core
        ref: x.x.x
        overrides:
          pepr:
            uds-exemptions:
              values:
                - path: exemptions.istioGatewayNodeport.enabled
                  value: true
    ```

However if you want to create an arbitrary exemption for your workloads, you can do so.
Here is an example of how to do this with bundle helm overrides:

```yaml
  - name: core
    repository: ghcr.io/defenseunicorns/packages/uds/core
    ref: x.x.x
    overrides:
      pepr:
        uds-exemptions:
          values:
            - path: exemptions.custom
              value:
                - name: my-app-exemptions
                  exemptions:
                    - policies:
                        - DisallowHostNamespaces
                        - DisallowPrivileged
                        - RequireNonRootUser
                      matcher:
                        namespace: my-namespace
                        name: "^my-privileged-pod.*"
                        kind: pod
                      title: "My privileged pod exemption"
                      description: "Exemption for pods that require privileged access"
                    - policies:
                        - DisallowNodePortServices
                      matcher:
                        namespace: my-namespace
                        name: "my-service"
                        kind: service
                      title: "NodePort service exemption"
                      description: "Required for external load balancer integration"
```
