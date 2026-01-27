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

| Component                | Transition Path                                                                                            |
| ------------------------ | ---------------------------------------------------------------------------------------------------------- |
| **UDS Core Services**    | All Core services use Istio Ambient Mode starting **0.43.0** (sidecar is not an option for Core services). |
| **Mission Applications** | Ambient is the **default** mode starting **0.60.0**. Sidecar remains as a supported **opt-in** option.     |

:::note
Mission Application = Any application outside of UDS Core
:::

:::note
**Existing Deployments** When upgrading to **0.43.0+** UDS Core will auto-transition Core services to Ambient Mode. No opt-out is available.
:::

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

See this [doc for additional Technical Guidance](https://uds.defenseunicorns.com/reference/configuration/service-mesh/istio-sidecar-vs-ambient/).

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
**A:** By upgrading to 0.43.0+ UDS Core services will automatically migrate to ambient mode. Mission apps can be switched to ambient by opting-in.
