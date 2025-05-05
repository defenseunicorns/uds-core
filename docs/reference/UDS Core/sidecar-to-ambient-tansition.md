---
title: Istio Sidecar to Ambient Mesh Transition
sidebar:
    order: 4
--------

As part of our evolving service mesh strategy, we are transitioning from using Istio's sidecar-based data plane to Ambient Mesh. This transition supports our goals of simplifying operations, reducing resource overhead, and improving latency—especially in constrained environments such as the tactical edge.

UDS Core has historically relied on Istio's sidecar mode to deliver secure service-to-service communication. However, as of UDS Core release v0.42.0, all core platform workloads now run in Ambient mode by default. Application teams on the UDS platform can opt in to Ambient mode today and will see it become the default over time.

This document outlines the phased plan for that transition and highlights the benefits, tradeoffs, and continued support for sidecar mode where needed.

## Transition Phases

### Phase 1: Initial Ambient Adoption (Current Phase)

* Ambient is currently **opt-in per package**.
* **Core components are fully deployed in Ambient mode**. This is mandatory and non-configurable.
* Mission applications and other packages **may choose between Ambient or Sidecar mode**.
* Mode selection is controlled through package configuration:

  * To explicitly opt into **ambient mode**:

    ```yaml
    mesh:
      mode: ambient
    ```
  * To explicitly use **sidecar mode**:

    ```yaml
    mesh:
      mode: sidecar
    ```

### Phase 2: Ambient Becomes Default (Planned in \~3 Months)

* Ambient will become the default data plane mode for all UDS Package CRs.
    * A UDS Package CR (Custom Resource) defines the deployment configuration for an application on the UDS platform, including service mesh settings.
    * Currently, if the service mesh mode is not explicitly defined in a Package CR, it defaults to `sidecar`. In approximately 3 to 4 months (timeline subject to final review), this default will change to `ambient`.
* Packages that require sidecar mode must explicitly opt out by setting the mode to `sidecar`.
* Most new and updated packages should adopt Ambient to align with future support and capabilities.

## Benefits of Ambient Mesh

Ambient Mesh provides several improvements over the traditional sidecar model:

* **Reduced resource usage**: Eliminates the need to run a sidecar proxy per pod, which decreases CPU and memory consumption.

  * [Istio Ambient Mesh Blog: Lower Cost, Better Performance](https://istio.io/latest/blog/2022/introducing-ambient-mesh/#lower-cost-better-performance)
* **Simplified deployment**: Avoids sidecar injection, making pod startup faster and reducing configuration overhead.

  * [Istio Ambient Architecture Overview](https://istio.io/latest/docs/ambient/what-is-ambient/#architecture-overview)
* **Layered architecture**: Separates Layer 4 (ztunnel) and Layer 7 (waypoint proxy) responsibilities, improving security and flexibility.

  * [Ambient Mesh Design](https://istio.io/latest/docs/ambient/)
* **Improved observability and control**: Offers service mesh features such as telemetry, policies, and traffic control without altering the application pod.

  * [Ambient Features and Capabilities](https://istio.io/latest/docs/ambient/faq/#ambient-features)

Refer to the upstream documentation for more detail:
[Choosing Between Sidecar and Ambient](https://istio.io/latest/docs/overview/dataplane-modes/#choosing-between-sidecar-and-ambient)

## When Sidecar Mode May Be Preferable

There are scenarios where continuing to use sidecar mode may be the better choice:

* **Multi-cluster topologies**: Some features in Ambient may not yet fully support complex multi-cluster setups.

  * [Istio Multi-Cluster Support Overview](https://istio.io/latest/docs/setup/install/multicluster/)
* **Advanced networking needs**: Use cases that rely on custom Envoy filters, protocol sniffing, or very fine-grained control of traffic may still require sidecars.

  * [Envoy Filter Customization with Sidecars](https://istio.io/latest/docs/reference/config/networking/envoy-filter/)
* **Performance tuning**: For workloads with highly specific performance constraints, sidecar configuration may provide more control.

  * [Istio Sidecar Resource Optimization Guide](https://istio.io/latest/docs/ops/deployment/performance-and-scalability/)
* **Compatibility or legacy integration**: If a service has not yet been validated to work in Ambient, teams may choose to remain on sidecar temporarily.

  * [Ambient FAQ - Compatibility Considerations](https://istio.io/latest/docs/ambient/faq/#ambient-compatibility)

## Long-Term Support Strategy

### UDS Core Services

* **UDS Core services** are now and will remain **ambient-only** for all future releases.

### Mission Applications

* **Mission applications** deployed on UDS will continue to support both **ambient** and **sidecar** modes. Sidecar remains **opt-in**, but **ambient is encouraged**.

* Upgrading to UDS Core v0.42.0 or later will automatically migrate its services to ambient. Mission apps are unaffected unless they explicitly opt in.
* We are **not publishing an end-of-support date for sidecar mode**. Hybrid mesh (ambient + sidecar) is low-maintenance and will remain supported for mission workloads.
    * Deprecation, if ever considered, would follow upstream guidance and include a multi-phase transition period.
* Sidecar workloads will still receive updates via the ongoing maintenance of core Istio components, which are required regardless of data plane mode.

This model allows us to leverage the benefits of ambient mesh where we have full testing and control (UDS Core), while minimizing disruption and complexity for downstream mission teams.

## Frequently Asked Questions

**Can I continue to run my app in sidecar mode?**
* Yes. Mission applications can continue using sidecar mode, but we recommend ambient for better performance and simplicity.

**Can I run UDS Core services in sidecar mode?**
* No. All UDS Core services are deployed exclusively in ambient mode starting with release v0.42.0.

**Will you be removing support for sidecar on mission apps?**
* No. There are no plans to remove support for sidecar mode on mission applications.

**Will sidecar workloads continue to get updates?**
* Yes. Since Istio components (e.g., control plane) are shared between modes, both ambient and sidecar workloads benefit from upstream updates and security patches.

**Does switching to ambient require replacing Istio?**
* No. Ambient mode is a deployment variation of Istio using additional components (e.g., ztunnel, waypoint). The same core Istio control plane continues to operate, especially for workloads that require capabilities not yet available in Ambient.
