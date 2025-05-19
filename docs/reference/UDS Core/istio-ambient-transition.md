---
title: Istio Transition and Support Policy
sidebar:
    order: 4
---

This policy outlines the transition of **UDS Core services** from the traditional **Istio sidecar model** to **Istio Ambient Mode**.

**Purpose of the transition:**

* Lower resource requirements
* Simplified operations
* Improved latency

These benefits are particularly important as UDS expands its **edge capabilities**.

---

## Scope

**Applies to:**

* All UDS Core services (e.g., logging, monitoring, SSO)
* All users deploying apps within UDS-managed environments

**Does NOT apply to:**

* Applications not managed by UDS Core
* Third-party infrastructure not provisioned through UDS tooling

---

## Transition Details

| Component                | Transition Path                                                                  |
| ------------------------ | -------------------------------------------------------------------------------- |
| **UDS Core Services**    | All deployments will use Istio Ambient Mode by default starting **XXXX**.        |
| **Existing Deployments** | Any UDS Core upgrade after **XXX** will auto-transition to Ambient Mode.         |
|                          | No opt-out is available.                                                         |
| **Mission Applications** | Both sidecar and ambient modes supported. Ambient is **opt-in** and recommended. |

> **Note:**
> Mission Application = Any application outside of UDS Core

---

## Support Policy

| Deployment Type          | Istio Ambient           | Istio Sidecar                |
| ------------------------ | ----------------------- | ---------------------------- |
| **UDS Core Services**    | Fully supported         | Not supported                |
| **Mission Applications** | Supported & recommended | Supported                    |
| **New Features**         | Prioritized for ambient | Evaluated case-by-case       |
| **Security & Patching**  | Provided                | Provided (shared components) |
| **Deprecation Plan**     | Active development      | No planned deprecation       |

---

## Technical Guidance

To enable **Ambient Mode**, configure your **UDS Package CR** with the appropriate mesh mode. The two supported configurations are:

To use **Ambient Mode**:

```yaml
mesh:
  mode: ambient
```

To use **Sidecar Mode**:

```yaml
mesh:
  mode: sidecar
```

This configuration enables traffic routing via the **Istio CNI plugin** and **ZTunnel proxy**, providing **Layer 4** security transparently without requiring sidecar injection or application modifications.

💡 To add **Layer 7** security controls, deploy **Istio Waypoints** as an additional proxy layer.

---

## Key Benefits of Ambient Mode

* Simplified service mesh configuration
* Improved pod startup time
* Reduced memory & CPU per workload
* Easier scaling and onboarding
* Eliminates the need for sidecar proxy per pod
* Better observability and control through a layered architecture (L4 via ztunnel, L7 via waypoint)

See more from the upstream Istio docs:

* [Istio Ambient Architecture Overview](https://istio.io/latest/docs/ambient/what-is-ambient/#architecture-overview)
* [Ambient Mesh Design](https://istio.io/latest/docs/ambient/)
* [Ambient Features and Capabilities](https://istio.io/latest/docs/ambient/faq/#ambient-features)

---

## When to Prefer Sidecar Mode

While Ambient Mode is recommended, there are scenarios where sidecar mode may be preferable:

* **Multi-cluster topologies** not yet fully supported in Ambient
* **Advanced networking needs** like custom Envoy filters, protocol sniffing, or fine-grained traffic control
* **Performance tuning** needs for latency-sensitive workloads
* **Legacy or compatibility constraints** where ambient functionality has not been validated

Useful references:

* [Istio Multi-Cluster Support](https://istio.io/latest/docs/setup/install/multicluster/)
* [Envoy Filter Customization](https://istio.io/latest/docs/reference/config/networking/envoy-filter/)
* [Sidecar Optimization Guide](https://istio.io/latest/docs/ops/deployment/performance-and-scalability/)
* [Ambient Compatibility FAQ](https://istio.io/latest/docs/ambient/faq/#ambient-compatibility)

---

## Frequently Asked Questions

**Q: Do I need to switch my app to Ambient Mode?**
**A:** No. Sidecar mode is still supported, but Ambient is recommended.

**Q: Will sidecar mode be deprecated for mission apps?**
**A:** No. It remains supported. Hybrid mesh (ambient + sidecar) is low-maintenance and will remain supported.

**Q: What happens when I update UDS Core?**
**A:** UDS Core services will automatically use Ambient Mode. Mission apps are unaffected unless they explicitly opt in.

**Q: Will Istio updates still apply to sidecar mode?**
**A:** Yes. Istio components are shared and continue to serve both Ambient and Sidecar modes with updates and patches.

**Q: Does switching to ambient require replacing Istio?**
**A:** No. Ambient is an alternate data plane within Istio. The core control plane remains unchanged.

**Q: How can I test or migrate to Ambient Mode?**
**A:**

* Enable Ambient in a non-production namespace using the `mesh.mode: ambient` configuration.
* Run sidecar and ambient services side-by-side in the same cluster to validate and compare behaviors.
