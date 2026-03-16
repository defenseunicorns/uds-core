---
title: LEGACY --Switching to Istio Ambient Mesh
draft: true
---

The UDS Operator supports automatically integrating your application with Istio Ambient Mesh. It also supports automatically migrating your workload from Istio Sidecars to Ambient mode if you are upgrading an existing application.

For the sake of this tutorial, we will cover migrating the podinfo application that was deployed in the previous tutorials to Ambient mode.

### Prerequisites

For this tutorial please ensure you are running at UDS Core version 0.55.1 or higher. This will ensure full ambient support is present, including Authservice protection.

Run `zarf package list` and check the version number for the `core` package:
```bash
❯ zarf package list
     Package | Namespace Override | Version | Components
     core    |                    | 0.55.1  | [uds-crds uds-operator-config prometheus-operator-crds pepr-uds-core istio-controlplane gateway-api-crds istio-admin-gateway istio-tenant-gateway keycloak neuvector loki kube-prometheus-stack vector grafana authservice velero]
```

### Migrate Podinfo To Istio Ambient Mode

While not explicitly called out in the previous tutorials, the UDS Operator automatically handled setting up Istio injection for the podinfo application. The default method for Istio mesh integration in UDS is [Sidecar](https://istio.io/latest/docs/reference/config/networking/sidecar/). If you look at the podinfo application and its namespace, you will notice that the UDS Operator added the proper attributes for the workload to be recognized by istio and have sidecar injection enabled. You'll also note that the podinfo pod is running two containers, one of these being the Istio sidecar:

```bash
❯ kubectl get ns podinfo --show-labels
NAME      STATUS   AGE   LABELS
podinfo   Active   33m   app.kubernetes.io/managed-by=zarf,istio-injection=enabled,kubernetes.io/metadata.name=podinfo

❯ kubectl get pods -n podinfo
NAME                       READY   STATUS    RESTARTS   AGE
podinfo-7d47686cc7-jdxng   2/2     Running   0          25m
```

By default, UDS Core ships with all required components to support both Istio Sidecar mode and Ambient mode starting in release v0.40.0 and onward. v0.48.0 and beyond include support for Authservice with Ambient mode. Migrating podinfo to Istio Ambient mode is as simple as making a single change to the Package Custom Resource.

In the Package Custom Resource definition, add a new entry for `spec.network.serviceMesh.mode: ambient`:
```yaml
apiVersion: uds.dev/v1alpha1
kind: Package
metadata:
  name: podinfo
  namespace: podinfo
spec:
  network:
    # Configure Istio Mode - can be either ambient or sidecar. Default is sidecar.
    serviceMesh:
      mode: ambient
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

Save your changes and re-apply the Package Custom Resource with `kubectl apply -f podinfo-package.yaml`.

Once applied, the UDS Operator will migrate the podinfo workload to Ambient mode by first updating the Istio label on the namespace:

```bash
❯ kubectl get ns podinfo --show-labels
NAME      STATUS   AGE   LABELS
podinfo   Active   71m   app.kubernetes.io/managed-by=zarf,istio.io/dataplane-mode=ambient,kubernetes.io/metadata.name=podinfo
```

The `istio.io/dataplane-mode=ambient` label tells Istio that all workloads in the `podinfo` namespace will use Ambient mode.

Next, the operator performed a rolling restart of the podinfo application. This is required to decommission the sidecar that was previously present:
```bash
❯ kubectl get po -n podinfo
NAME                                         READY   STATUS    RESTARTS   AGE
podinfo-7d47686cc7-mlr59                     1/1     Running   0          3m14s
uds-core-podinfo-waypoint-55547ff65b-2nqsf   1/1     Running   0          3m13s
```

Notice how the pod only has a single container. The podinfo application has been successfully migrated to Ambient! Also notice the `waypoint` pod which is added here. This waypoint is required to support SSO with Authservice (read more about waypoints [here](https://istio.io/latest/docs/ambient/usage/waypoint/)).

> [!NOTE]
> Learn more about the changes introduced in Ambient mode [here](https://istio.io/latest/docs/ambient/overview/).

You can also validate that all of the other integrations we setup are still present (navigate to https://podinfo.uds.dev/ and login again, etc).

#### Clean up

Execute the following command to clean up your cluster:

```bash
k3d cluster delete uds
```
