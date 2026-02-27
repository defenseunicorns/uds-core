---
title: Functional Layers
---

## Background

Context on the inclusion of "functional layers" can be viewed in our [ADR](https://github.com/defenseunicorns/uds-core/blob/main/adrs/0002-uds-core-functional-layers.md). In short, UDS Core publishes smaller Zarf packages that contain subsets of core's capabilities, grouped by their function (such as monitoring, logging, backup/restore, etc) to allow more flexibility in deployment. This helps to support resource constrained environments (edge deployments) and other situations where an environment has different needs than the default core stack.

Each layer is published as an individual OCI Zarf package. Package sources can be viewed under the [`packages` directory](https://github.com/defenseunicorns/uds-core/tree/main/packages), with each folder containing a readme detailing the contents and any dependencies. All layers assume the requirement of the base layer which provides Istio, the UDS Operator, and UDS Policy Engine.

:::caution
By removing pieces of core from your deployment you may affect your security and compliance posture as well as reduce functionality of the stack. Deploying core using these layers should be the exception in most cases and only done after carefully weighing needs for your environment.
:::

## Example Usage

Functional layers are designed to be combined into a UDS bundle for deployment. The example below shows all layers in the correct order. Keep in mind that 'base' must always be the first layer, and any other layers should follow based on their dependency order. When building your bundle, you can skip layers that don't fit your deployment needs and apply overrides to individual layers as needed. Ensure all layers are using the same version for compatibility.

```yaml
kind: UDSBundle
metadata:
  name: functional-layer-core-bundle
  description: An example bundle for deploying all of core using functional layers
  version: "0.1.0"

packages:
  - name: core-base
    repository: ghcr.io/defenseunicorns/packages/uds/core-base
    ref: 0.54.1-upstream
  - name: core-identity-authorization
    repository: ghcr.io/defenseunicorns/packages/uds/core-identity-authorization
    ref: 0.54.1-upstream
  - name: core-metrics-server
    repository: ghcr.io/defenseunicorns/packages/uds/core-metrics-server
    ref: 0.54.1-upstream
  - name: core-runtime-security
    repository: ghcr.io/defenseunicorns/packages/uds/core-runtime-security
    ref: 0.54.1-upstream
  - name: core-logging
    repository: ghcr.io/defenseunicorns/packages/uds/core-logging
    ref: 0.54.1-upstream
  - name: core-monitoring
    repository: ghcr.io/defenseunicorns/packages/uds/core-monitoring
    ref: 0.54.1-upstream
  - name: core-backup-restore
    repository: ghcr.io/defenseunicorns/packages/uds/core-backup-restore
    ref: 0.54.1-upstream
```

## Layer Selection

Layer selection will always be deployment-specific but below are guidelines for what layers to consider for your deployment.  The layers marked with a cross (†) are those needed to follow the [Big Bang Conformant Stack](https://repo1.dso.mil/big-bang/product/bbtoc/-/blob/master/policy/conformance.md?ref_type=heads) though if you are not bound by that document, UDS Core Base is the only *technical* layer required to install most UDS Packages.

| UDS Core Layers | Selection Criteria |
|----------------|--------------------|
| Runtime Security†*         | Provides more advanced security with runtime inspection <br/> *(install if resources allow and more advanced security is desired)* |
| Monitoring†*                | Provides frontend log / metrics monitoring and alerting <br/> *(install if resources allow and more advanced debugging is desired)* |
| Backup and Restore         | Allows volumes and k8s objects to be backed up and restored <br/> *(install if deployment provides critical data or must maintain state)* |
| Identity and Authorization† | Provides authentication and authorization functionality <br/>*(install if deployment requires an auth mechanism (i.e. direct user login))*  |
| Logging†                   | Provides backend log storage and log shipping capabilities <br/> *(install if the deployment requires log aggregation and shipping)* |
| Metrics Server†**          | Provides metrics collection capabilities (req of UDS Runtime) <br/> *(install if the cluster does not provide its own metrics server)* |
| Base†                      | Provides the base for all other functional layers <br/> *(required for all "UDS" deployments and all other functional layers)* |

:::note
*The Monitoring and Runtime Security layers provide user login and therefore require the Identity and Authorization layer.
:::

:::note
**The Metrics Server layer provides a metrics server if your cluster does not deploy metrics server itself.  If your cluster does provide its own metrics server deployment ensure that you do NOT enable this layer.
:::

| UDS Add-ons* | Selection Criteria |
|------------|--------------------|
| UDS UI           | Provides a common operating picture for a Kubernetes cluster and UDS deployments <br/> *(install if you would like to have an easy-to-use window into your cluster/deployments)* |
| UDS Registry     | Provides a storage location for UDS components and mission applications <br/> *(install if you would like to be able to easily store and view the software available in your environment)* |
| UDS Remote Agent | Allows for more advanced remote cluster management / deployment <br/> *(install if you would like to manage UDS deployments from more advanced clients than UDS CLI)* |

:::note
*UDS Add-ons are not part of the open-source platform but are also not required to maintain / operate a UDS deployment.  They provide additional functionality to streamline the deployment, monitoring, and management of the deployment for the given organization.
:::

| UDS Core Pre-Requisites* | Selection Criteria |
|--------------------------|--------------------|
| UDS Package Minio Operator | Provides storage for the Logging and Backup and Restore layers <br/> *(install after core base but before logging/backup and restore if selected)* |
| UDS Package MetalLB        | Provides a simple LoadBalancer implementation <br/> *(install after Zarf init and before UDS Core Base)* |

:::note
*You may need to deploy pre-requisite packages that are not a part of UDS Core's layers if you are on prem or in an edge scenario - usually cloud deployments will have their own offerings to provide these services which we recommend to use instead.
:::
