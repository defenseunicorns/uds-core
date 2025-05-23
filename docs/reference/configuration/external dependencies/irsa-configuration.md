---
title: IRSA Support
sidebar:
  order: 6
---

Several applications within UDS Core can be configured to utilize resources that are external to your Kubernetes cluster, such as object storage and databases. If you are running in AWS, you can leverage [IRSA](https://docs.aws.amazon.com/eks/latest/userguide/iam-roles-for-service-accounts.html) to provide applications within UDS Core with a secure means of accessing external resources.

The following applications in UDS Core that support IRSA are:
- [Loki](#loki)
- [Velero](#velero)

:::note
There may be additional applications in UDS Core that are not mentioned in this list that support IRSA. Only the applications listed above have been validated for IRSA support within UDS Core.
:::

This guide will cover how to configure IRSA for each application. 

## Prerequisites
Configuring IRSA requires that you have configured an IAM OIDC provider for your cluster. Refer to the IRSA [documentation](https://docs.aws.amazon.com/eks/latest/userguide/enable-iam-roles-for-service-accounts.html) for more information.

You must also create IAM Roles and Policies for each application. Refer to the IRSA [documentation](https://docs.aws.amazon.com/eks/latest/userguide/associate-service-account-role.html) for more information.

## Bundle Configuration
Configuring applications within UDS Core to use IRSA requires that you declare overrides in UDS Bundle configuration. Below are the necessary overrides for each application.

:::note
The examples below are not exhaustive representations of all of the values you will need to supply to configure external storage.

The examples below declare new `variables` for IRSA Role ARN annotations, allowing for these values to be passed in dynamically via `uds-config.yaml` as opposed to being hardcoded as `overrides`.
:::


### Loki
Loki can be configured to use IRSA by setting the following overrides in your `uds-bundle.yaml`:

```yaml
packages:  
  - name: core
    repository: oci://ghcr.io/defenseunicorns/packages/uds/core
    ref: x.x.x
    overrides:
      loki:
        loki:
          # Override default values set in uds-core-loki package
          values:
            - path: loki.storage.s3.endpoint
              value: ""
            - path: loki.storage.s3.secretAccessKey
              value: ""
            - path: loki.storage.s3.accessKeyId
              value: ""
          # Declare new variable for IRSA Role ARN
          variables:
            - name: LOKI_IRSA_ROLE_ARN
              description: "ARN of Loki IAM Role to annotate Loki ServiceAccount with."
              # Maps to Loki's helm values for ServiceAccount annotations:
              # See https://github.com/grafana/loki/blob/0dc9d677b6ed5c4440346ab54e9776185900be38/production/helm/loki/values.yaml#L733
              path: serviceAccount.annotations.eks\.amazonaws\.com/role-arn              
```

Next, in your `uds-config.yaml`, supply a value for `LOKI_IRSA_ROLE_ARN`:

```yaml
variables:
  core:
    loki_irsa_role_arn: "<iam-role-arn>"
```

### Velero
Velero can be configured to use IRSA by setting the following overrides in your `uds-bundle.yaml`:

```yaml
packages:  
  - name: core
    repository: oci://ghcr.io/defenseunicorns/packages/uds/core
    ref: x.x.x
    overrides:
      velero:
        velero:
          # Override default values set in uds-core-velero package
          values:
            - path: credentials.useSecret
              value: false      
          # Declare new variable for IRSA Role ARN
          variables:
            - name: VELERO_IRSA_ROLE_ARN
              description: "IRSA ARN annotation to use for Velero"
              # Maps to Velero's helm values for ServiceAccount annotations:
              # See https://github.com/vmware-tanzu/helm-charts/blob/fcc60b0ca3886eb760151c69c166108a807efdef/charts/velero/values.yaml#L491
              path: serviceAccount.server.annotations.irsa/role-arn
```

Next, in your `uds-config.yaml`, supply a value for `VELERO_IRSA_ROLE_ARN`:

```yaml
variables:
  core:
    velero_irsa_role_arn: "<iam-role-arn>"
```
