---
title: Istio Ambient vs. Ambient Sidecar in UDS Core
---

This document outlines the key differences between Istio's Ambient and Sidecar modes as they relate to UDS Core. Understanding these differences is crucial for choosing the right mode for your application deployments.

UDS Core leverages Istio for service mesh capabilities. Istio offers two primary modes of operation:

*   **Ambient Mesh:** A newer, simpler model that uses node-level (ztunnel) proxies and optional waypoint proxies to provide service mesh functionality.
*   **Sidecar Proxy:** The traditional Istio model where each application pod has its own dedicated Envoy proxy running as a sidecar container.

## Key Differences

| Feature           | Ambient Mesh                                                                          | Sidecar Proxy                                           | 
| ----------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Proxy Location    | Node-level (ztunnel) + optional Waypoint proxies                                      | Pod-level (Envoy sidecar)                               |
| Resource Usage    | Lower - Proxies are shared across pods on a node.                                     | Higher - Each pod has its own proxy.                    |
| Complexity        | Lower - No sidecar injection required by default.                                     | Higher - Requires sidecar injection.                    | 
| Isolation         | Network-level (ztunnel), Pod-level (with Waypoint proxies)                            | Strong - Pod-level isolation.                           | 
| Upgrade           | Less Disruptive - ztunnel upgrades don't require pod restarts.                        | Disruptive - Pod restarts required for sidecar updates. |
| Security          | ztunnel handles base security; Waypoint proxies add pod-level policy when configured. | All traffic inspected at the pod level.                 |
| mTLS              | ztunnel handles mTLS.                                                                 | Sidecars handle mTLS.                                   | 
| HTTP L7 policies  | Enforced by Waypoint Proxies when needed.                                             | Enforced by sidecars.                                   |

## Ambient Mesh Mode (Default)

In Ambient Mesh mode, Istio uses node-level proxies (ztunnel) and optional waypoint proxies to provide service mesh functionality. Ztunnel runs on each node and intercepts traffic at the node level. [Waypoint proxies](https://istio.io/latest/docs/ambient/usage/waypoint/) are deployed alongside applications that require more fine-grained control or advanced features.

**Pros:**

*   **Lower Resource Overhead:** Reduces resource consumption as proxies are shared across multiple pods on a node.
*   **Simplified Deployments:** Simplifies pod deployments as no sidecar injection is required by default.
*   **Less Disruptive Upgrades:** Upgrades to ztunnel are less disruptive as they don't require pod restarts.

**Cons:**

*   **Migration:** If migrating from Sidecar to Ambient, planning must be done ahead of time to ensure a smooth transition. However, the UDS Operator automatically handles Istio configuration changes for you, making the transition an easier process.
*   **Less Mature than Sidecar:** Ambient is a newer feature than Sidecar, so there may be more undiscovered bugs.
*   **Traffic Shift:** With the introduction of Ambient, Layer 7 Authorization features are only available via opting into an optional Envoy proxy via the Waypoint resource.

**When to Use Ambient Mesh Mode:**

*   When you want to minimize resource consumption.
*   When you want to simplify application deployments.
*   For most applications that don't require very fine-grained policy enforcement or features not yet supported in Ambient Mesh.
*   For help deciding, [this](https://blog.howardjohn.info/posts/opinionated-istio/#ambient-mode) article is a recommended read.

**Configuration:**

You can use ambient mode by setting `spec.network.serviceMesh.mode: ambient` in your [UDS Package](/reference/configuration/uds-operator/package/). When `spec.network.serviceMesh.mode` is not configured, the UDS Operator will default your Package to Ambient mode.

## Sidecar Proxy Mode

In Sidecar mode, an Envoy proxy runs as a sidecar container within each application pod. All traffic to and from the application is intercepted and managed by this sidecar proxy.

**Pros:**

*   **Strong Isolation:** Provides strong isolation between the application and the proxy.
*   **Mature Feature Set:** Has a more mature feature set compared to Ambient Mesh.
*   **Granular Control:** Allows very fine-grained control over traffic management and security policies at the pod level.

**Cons:**

*   **Higher Resource Overhead:** Sidecar proxies consume resources (CPU, memory) on each pod, even if the pod doesn't require advanced mesh features.
*   **Increased Complexity:** Increases the complexity of pod deployments due to sidecar injection.
*   **Disruptive Upgrades:** Upgrading sidecars typically involves restarting pods.

**When to Use Sidecar Mode:**

*   When you need very strong isolation between your application and the Istio proxy.
*   When you require features not yet available in Ambient Mesh.
*   When you have applications already designed to work with sidecar injection.

**Configuration:**

To explicitly use sidecar injection, set `spec.network.serviceMesh.mode: sidecar` in your [UDS Package](/reference/configuration/uds-operator/package/) resource definition. If you do not configure `spec.network.serviceMesh.mode` in your UDS Package, the UDS Operator will default to Ambient mode.

## Choosing the Right Mode
While Ambient Mesh has clear benefits and growing adoption, consider the following when choosing between Sidecar and Ambient Mesh:

*   **Resource Optimization:** If minimizing resource consumption is a top priority, Ambient Mesh is the better choice.
*   **Security and Control:** Ambient Mesh offers the same level of security as sidecar, but waypoint proxies must be configured for each service.
*   **Simplicity:** If you want to simplify application deployments and reduce operational overhead, Ambient Mesh is a good option.
*   **Feature Requirements:** Evaluate whether all the features you need are supported in Ambient Mesh. If not, you'll need to use Sidecar mode or consider using Waypoint Proxies with ambient mode when possible.

Sidecar mode remains a valuable option for specific use cases where its strengths are required. For more resource aware deployments, Ambient offers a more streamlined approach that saves CPU, Memory, and Networking overhead as your environment scales. The UDS Operator will continue to support both Sidecar and Ambient, allowing you to make the best choice for your needs.

:::note
Interested in seeing how Ambient Mesh can reduce CPU and Memory utilization for your workloads that are using Sidecar? Check out the "Istio Sidecar vs Ambient Resource Comparison" Dashboard in Grafana!
:::

See the [Istio documentation](https://istio.io/latest/docs/overview/dataplane-modes/#choosing-between-sidecar-and-ambient) for more information and resources.
