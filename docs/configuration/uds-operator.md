---
title: UDS Operator
type: docs
weight: 2
---

The UDS Operator plays a pivotal role in managing the lifecycle of UDS Package Custom Resources (CRs) along with their associated resources like NetworkPolicies and Istio VirtualServices. Leveraging [Pepr](https://github.com/defenseunicorns/pepr), the operator binds watch operations to the enqueue and reconciler, taking on several key responsibilities for UDS Packages and exemptions:

## Package

- **Enabling Istio Sidecar Injection:**
  - The operator facilitates the activation of Istio sidecar injection within namespaces where the CR is deployed.
- **Establishing Default-Deny Ingress/Egress Network Policies:**
  - It sets up default-deny network policies for both ingress and egress, creating a foundational security posture.
- **Implementing Layered Allow-List Approach:**
  - A layered allow-list approach is applied on top of default-deny network policies. This includes essential defaults like Istio requirements and DNS egress.
- **Providing Targeted Remote Endpoints Network Policies:**
  - The operator creates targeted network policies for remote endpoints, such as `KubeAPI` and `CloudMetadata`. This approach aims to enhance policy management by reducing redundancy (DRY) and facilitating dynamic bindings in scenarios where static definitions are impractical.
- **Creating Istio Virtual Services and Related Ingress Gateway Network Policies:**
  - In addition, the operator is responsible for generating Istio Virtual Services and the associated network policies for the ingress gateway.

### Example UDS Package CR

```yaml
apiVersion: uds.dev/v1alpha1
kind: Package
metadata:
  name: grafana
  namespace: grafana
spec:
  network:
    # Expose rules generate Istio VirtualServices and related network policies
    expose:
      - service: grafana
        selector:
          app.kubernetes.io/name: grafana
        host: grafana
        gateway: admin
        port: 80
        targetPort: 3000

    # Allow rules generate NetworkPolicies
    allow:
      - direction: Egress
        selector:
          app.kubernetes.io/name: grafana
        remoteGenerated: Anywhere

      - direction: Egress
        remoteNamespace: tempo
        remoteSelector:
          app.kubernetes.io/name: tempo
        port: 9411
        description: "Tempo"

  # SSO allows for the creation of Keycloak clients and with automatic secret generation
  sso:
    - name: Grafana Dashboard
      clientId: uds-core-admin-grafana
      redirectUris:
        - "https://grafana.admin.uds.dev/login/generic_oauth"
```

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
  name: neuvector
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
        namespace: neuvector
        name: "^neuvector-enforcer-pod.*"

    - policies:
        - DisallowPrivileged
        - RequireNonRootUser
        - DropAllCapabilities
        - RestrictHostPathWrite
        - RestrictVolumeTypes
      matcher:
        namespace: neuvector
        name: "^neuvector-controller-pod.*"

    - policies:
        - DropAllCapabilities
      matcher:
        namespace: neuvector
        name: "^neuvector-prometheus-exporter-pod.*"
```

### Example UDS Package CR with SSO Templating

By default, UDS generates a secret for the Single Sign-On (SSO) client that encapsulates all client contents as an opaque secret. In this setup, each key within the secret corresponds to its own environment variable or file, based on the method used to mount the secret. If customization of the secret rendering is required, basic templating can be achieved using the `secretTemplate` property. Below are examples showing this functionality. To see how templating works, please see the [Regex website](https://regex101.com/r/e41Dsk/3).

```yaml
apiVersion: uds.dev/v1alpha1
kind: Package
metadata:
  name: grafana
  namespace: grafana
spec:
  sso:
    - name: My Keycloak Client
      clientId: demo-client
      redirectUris:
        - "https://demo.uds.dev/login"
      # Customize the name of the generated secret
      secretName: my-cool-auth-client
      secretTemplate:
        # Raw text examples
        rawTextClientId: "clientField(clientId)"
        rawTextClientSecret: "clientField(secret)"

        # JSON example
        auth.json: |
          {
            "client_id": "clientField(clientId)",
            "client_secret": "clientField(secret)",
            "defaultScopes": clientField(defaultClientScopes).json(),
            "redirect_uri": "clientField(redirectUris)[0]",
            "bearerOnly": clientField(bearerOnly),
          }

        # Properties example
        auth.properties: |
          client-id=clientField(clientId)
          client-secret=clientField(secret)
          default-scopes=clientField(defaultClientScopes)
          redirect-uri=clientField(redirectUris)[0]

        # YAML example (uses JSON for the defaultScopes array)
        auth.yaml: |
          client_id: clientField(clientId)
          client_secret: clientField(secret)
          default_scopes: clientField(defaultClientScopes).json()
          redirect_uri: clientField(redirectUris)[0]
          bearer_only: clientField(bearerOnly)
  ```

### Configuring UDS Core Policy Exemptions

Default [policy exemptions](https://github.com/defenseunicorns/uds-core/blob/main/src/pepr/operator/crd/generated/exemption-v1alpha1.ts) are confined to a singular namespace: `uds-policy-exemptions`. We find this to be an optimal approach for UDS due to the following reasons:

- **Emphasis on Security Impact:**
  - An exemption has the potential to diminish the overall security stance of the cluster. By isolating these exemptions within a designated namespace, administrators can readily recognize and assess the security implications associated with each exemption.
- **Simplified RBAC Maintenance:**
  - Adopting this pattern streamlines the management of Role-Based Access Control (RBAC) for overseeing exemptions. Placing all UDS exemptions within a dedicated namespace simplifies the task of configuring and maintaining RBAC policies, enhancing overall control and transparency.
- **Mitigation of Configuration Risks:**
  - By restricting exemptions to a specific namespace, the risk of unintentional misconfigurations in RBAC is significantly reduced. This ensures that cluster exemptions are only granted intentionally and within the confines of the designated namespace, minimizing the potential for security vulnerabilities resulting from misconfigured permissions.

### Allow All Namespaces

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

## Key Files and Folders

```dir
src/pepr/operator/
├── controllers             # Core business logic called by the reconciler
│   ├── exemptions          # Manages updating Pepr store with exemptions from UDS Exemption
│   ├── istio               # Manages Istio VirtualServices and sidecar injection for UDS Packages/Namespace
│   ├── keycloak            # Manages Keycloak client syncing
│   └── network             # Manages default and generated NetworkPolicies for UDS Packages/Namespace
├── crd
│   ├── generated           # Type files generated by `uds run -f src/pepr/tasks.yaml gen-crds`
│   ├── sources             # CRD source files
│   ├── migrate.ts          # Migrates older versions of UDS Package CRs to new version
│   ├── register.ts         # Registers the UDS Package CRD with the Kubernetes API
│   └── validators          # Validates Custom Resources with Pepr
├── index.ts                # Entrypoint for the UDS Operator
└── reconcilers             # Reconciles Custom Resources via the controllers
```
