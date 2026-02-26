---
title: LEGACY --Integrating an Application with UDS Core
draft: true
---

## Background

When UDS Core is deployed into a Kubernetes Cluster, an [operator](https://kubernetes.io/docs/concepts/extend-kubernetes/operator/) is deployed. An operator allows users to extend the functionality of their Kubernetes clusters via [Custom Resource Definitions](https://kubernetes.io/docs/concepts/extend-kubernetes/api-extension/custom-resources/) and custom controllers. This operator, henceforth known as the UDS Operator, looks for `Package` Custom Resources to be created. When a user creates a `Package` resource, the UDS Operator processes the request and performs the necessary operations to create the package per the [specification](/reference/configuration/custom-resources/packages-v1alpha1-cr/) given.

Read more about the UDS Operator [here](https://uds.defenseunicorns.com/reference/configuration/uds-operator/).

### Prerequisites

In this section, we will configure Single Sign On (SSO) for a sample user to access the `podinfo` application. This requires that your Keycloak instance has existing users and groups defined. This configuration has been automated via the `uds` cli. 

In the root of the `package` directory, create a new file called `tasks.yaml` and include the lines below:

```yaml
includes:
  - common-setup: https://raw.githubusercontent.com/defenseunicorns/uds-common/v1.24.0/tasks/setup.yaml
```

### Integrate Podinfo with UDS Core

You can think of the UDS Operator as the "glue" between your application and the services that are provided by UDS Core. It is a [Kubernetes Operator](https://kubernetes.io/docs/concepts/extend-kubernetes/operator/) that has working knowledge of UDS Core services in the cluster and takes care of integrating your app with those services for you. To register your application with the UDS Operator, you need to create a `Package` Kubernetes Custom Resource. Within the specification of the `Package` resource, you can specify different parameters that dictate how the UDS Operator should integrate your app per its unique requirements. The sections below cover creating a `Package` resource for `podinfo` and integrating `podinfo` with several UDS Core services.

> [!NOTE]
> The `Package` Custom Kubernetes Resource is different from a [UDS Package](https://uds.defenseunicorns.com/structure/packages/), which is a collection of the Zarf Package for your application and the Kubernetes `Package` Custom Resource.

> [!NOTE]
> All resources created by the UDS Operator for `podinfo` will have a `uds/package=podinfo` label applied to it.

#### Create a Package Resource for Podinfo

Below is a baseline definition of a `Package` Custom Resource for the `podinfo` application. As you progress through this demo, you will add values for `network`, `sso`, and `monitor`. These fields instruct the UDS Operator on how to configure networking, SSO, and monitoring for the `podinfo` application.

```yaml
apiVersion: uds.dev/v1alpha1
kind: Package
metadata:
  name: podinfo
  namespace: podinfo
spec:
  network:
    # Expose rules generate Istio VirtualServices and related network policies
    expose: {}
```

Copy this YAML into a code editor and save the file as `podinfo-package.yaml`.

#### Secure Podinfo with Istio and Network Policies

UDS Core deploys [Istio](https://istio.io/), a powerful networking component that allows cluster administrators to end-to-end encrypt all cluster traffic, set explicit rules for traffic routing, add load balancing, and much more. Building on the existing `Package` definition, add the following configuration under `spec.network.expose` field:

```yaml
apiVersion: uds.dev/v1alpha1
kind: Package
metadata:
  name: podinfo
  namespace: podinfo
spec:
  network:
    # Expose rules generate Istio VirtualServices and related network policies
    expose:
      - service: podinfo
        selector:
          app.kubernetes.io/name: podinfo
        gateway: tenant
        host: podinfo
        port: 9898
```

This change will allow us to interact with `podinfo` without having to use `kubectl port-forward`. 

Save your changes and apply the file:

```bash
kubectl apply -f podinfo-package.yaml
```

View the package resource:

```bash
❯ kubectl get package -n podinfo
NAME      STATUS   SSO CLIENTS   ENDPOINTS             MONITORS   NETWORK POLICIES   AUTHORIZATION POLICIES   AGE
podinfo   Ready    []            ["podinfo.uds.dev"]   []         5                  2                        4s
```

View the pods. Notice how the podinfo pod has an additional container as a result of the UDS Operator configuring istio:
```bash
❯ kubectl get pods -n podinfo
NAME                           READY   STATUS    RESTARTS   AGE
podinfo-5cbbf59f6d-bqhsk       2/2     Running   0          2m
```

Observe the Istio VirtualService that the UDS Operator created:

```bash
❯ kubectl get virtualservice -n podinfo
NAME                                  GATEWAYS                                  HOSTS                 AGE
podinfo-tenant-podinfo-9898-podinfo   ["istio-tenant-gateway/tenant-gateway"]   ["podinfo.uds.dev"]   60s
```

You will also notice that the UDS Operator automatically generated a set of Kubernetes `NetworkPolicies` that restrict access to your application to only required services:

```bash
❯ kubectl get networkpolicy -n podinfo
NAME                                                      POD-SELECTOR                     AGE
allow-podinfo-egress-dns-lookup-via-coredns               <none>                           50s
allow-podinfo-egress-istiod-communication                 <none>                           50s
allow-podinfo-ingress-9898-podinfo-istio-tenant-gateway   app.kubernetes.io/name=podinfo   50s
allow-podinfo-ingress-sidecar-monitoring                  <none>                           50s
deny-podinfo-default                                      <none>                           50s
```

Navigate to `podinfo.uds.dev` from your browser to interact with `podinfo`.

#### Integrate with Single Sign On

At this stage, anyone can access the `podinfo` application. You may wish to protect your application by only allowing authenticated users to access it. As part of UDS Core, [Keycloak](https://www.keycloak.org/) and [Authservice](https://github.com/istio-ecosystem/authservice) are provided for Identity and Authorization management. Add the configuration under the `spec.sso` field below to integrate the `podinfo` application with Keycloak and  Authservice

```yaml
apiVersion: uds.dev/v1alpha1
kind: Package
metadata:
  name: podinfo
  namespace: podinfo
spec:
  network:
    # Expose rules generate Istio VirtualServices and related network policies
    expose:
      - service: podinfo
        selector:
          app.kubernetes.io/name: podinfo
        gateway: tenant
        host: podinfo
        port: 9898
  # SSO allows for the creation of Keycloak clients and with automatic Authservice integration
  sso:
    - name: Podinfo SSO
      clientId: uds-core-podinfo
      redirectUris:
        - "https://podinfo.uds.dev/login"
      enableAuthserviceSelector:
        app.kubernetes.io/name: podinfo
      groups:
        anyOf:
          - "/UDS Core/Admin"
```

Save the file and apply the changes:

```bash
kubectl apply -f podinfo-package.yaml
```

The package will now show the `uds-core-podinfo` client under `SSO CLIENTS`:

```bash
❯ kubectl get package -n podinfo
NAME      STATUS   SSO CLIENTS            ENDPOINTS             MONITORS   NETWORK POLICIES   AUTHORIZATION POLICIES   AGE
podinfo   Ready    ["uds-core-podinfo"]   ["podinfo.uds.dev"]   []         7                  4                        3m29s
```

> [!NOTE]
> Notice how the count under `NETWORK POLICIES` has increased. The UDS Operator recognized that additional `NetworkPolicies` were required for Keycloak to communicate with `podinfo`, so it automatically created additional `NetworkPolicies` to allow that.

When navigating to https://podinfo.uds.dev/, you will be redirected to a login screen. Only users that are members of the `/UDS Core/Admin` group in Keycloak are permitted to access the site. Create a test user in that group with the following command (using the uds-common task included above):

```bash
uds run common-setup:keycloak-user --set KEYCLOAK_USER_GROUP="/UDS Core/Admin"
```

Use the following credentials to login to https://podinfo.uds.dev/: `username: doug / password: unicorn123!@#UN`

#### Add Monitoring and Metrics Scraping

UDS Core also deploys Prometheus for collecting application metrics. Prometheus relies on `ServiceMonitor` and `PodMonitor` resources that inform Prometheus on which workloads to collect metrics from. These resources can be configured via the `spec.monitor` field in the `Package` Custom Resource:

```yaml
apiVersion: uds.dev/v1alpha1
kind: Package
metadata:
  name: podinfo
  namespace: podinfo
spec:
  network:
    # Expose rules generate Istio VirtualServices and related network policies
    expose:
      - service: podinfo
        selector:
          app.kubernetes.io/name: podinfo
        gateway: tenant
        host: podinfo
        port: 9898
  # SSO allows for the creation of Keycloak clients and with automatic secret generation and protocolMappers
  sso:
    - name: Podinfo SSO
      clientId: uds-core-podinfo
      redirectUris:
        - "https://podinfo.uds.dev/login"
      enableAuthserviceSelector:
        app.kubernetes.io/name: podinfo
      groups:
        anyOf:
          - "/UDS Core/Admin"
  # Monitor generates Prometheus Service and Pod monitor resources, capturing metrics exposed by your application
  monitor:
    - selector:
        app.kubernetes.io/name: podinfo
      targetPort: 9898
      portName: http
      description: "podmonitor"
      kind: PodMonitor
    - selector:
        app.kubernetes.io/name: podinfo
      targetPort: 9898
      portName: http
      description: "svcmonitor"
      kind: ServiceMonitor
```

Save the file and apply the changes:

```bash
kubectl apply -f podinfo-package.yaml
```

The package will now show `ServiceMonitors` and `PodMonitors` configured under `MONITORS`:

```bash
❯ kubectl get package -n podinfo
NAME      STATUS   SSO CLIENTS            ENDPOINTS             MONITORS                                      NETWORK POLICIES   AUTHORIZATION POLICIES   AGE
podinfo   Ready    ["uds-core-podinfo"]   ["podinfo.uds.dev"]   ["podinfo-podmonitor","podinfo-svcmonitor"]   9                  6                        6m38s
```

View the `PodMonitor` and `ServiceMonitor` resources that were created by the UDS Operator:

```bash
❯ kubectl get podmonitor,servicemonitor -n podinfo
NAME                                                  AGE
podmonitor.monitoring.coreos.com/podinfo-podmonitor   24s

NAME                                                      AGE
servicemonitor.monitoring.coreos.com/podinfo-svcmonitor   24s
```

Logs and Metrics for `podinfo` can now be viewed in Grafana, which is deployed with UDS Core. Navigate to `grafana.admin.uds.dev` and login using the same credentials from the previous step (you may still be signed in since Keycloak is used for all authentication).

From the menu, navigate to `Explore`, then select `Prometheus` from the top drop-down. Paste in the query `rate(process_cpu_seconds_total{namespace="podinfo"}[$__rate_interval])` and hit the `Run Query` button (blue refresh button on top right). This will provide us with a graph based on the metrics served by Podinfo.

Now you have successfully integrated `podinfo` with UDS Core!

#### Next Steps

(Optional) With the `Package` Custom resource now created that integrates `podinfo` into UDS Core, the next guide will cover including the `Package` Custom Resource as part of your Zarf Package and UDS Bundle.
