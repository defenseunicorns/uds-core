# 4. Implement Per-Namespace Webhook Failure Policy for Istio

Date: 2025-08-25

## Status

Accepted

## Context

In [ADR-0003](./0003-exclude-istio-from-policy-engine.md), there was a need to exclude the `istio-system` namespace from policy enforcement to prevent deadlocks during cluster operations. The original implementation used a blanket namespace exclusion in the Pepr webhook configuration.

Since then, upstream Pepr has implemented support for [per-namespace webhook failure policies](https://github.com/defenseunicorns/pepr/issues/2546). This allows more granular control over webhook failures, particularly for critical system namespaces like `istio-system`.

For additional context on the original issue see [ADR-0003](./0003-exclude-istio-from-policy-engine.md).

## Decision

The Pepr configuration will be updated to use the new `additionalWebhooks` feature with an `Ignore` failure policy for the `istio-system` namespace, while maintaining strict policy enforcement for other namespaces.

The following changes will be made to `package.json`:

1. Remove `istio-system` from `admission.alwaysIgnore.namespaces`
2. Add a new `additionalWebhooks` configuration:
   ```json
   "additionalWebhooks": [{
     "failurePolicy": "Ignore",
     "namespace": "istio-system"
   }]
   ```

## Consequences

### Positive

- Improved Security: Maintains strict policy enforcement for all namespaces, and ensures policy enforcement on `istio-system` when webhooks are available.
- Continued Reliability: Does not have any poor impact on availability of service mesh (`istio-system`) components, or cause any new deadlock behaviors.

### Negative

- In different environments, `istio-system` may run with slightly different `securityContext` behavior depending on whether mutations are performed or not (leading to a chance of configuration drift). In general, however, Istio has predefined `securityContext`s for its pods, meaning that mutations are minimal.
- As noted in [ADR-0003](./0003-exclude-istio-from-policy-engine.md), there is still potential for a malicious user with access to `istio-system` to run a privileged workload, when the webhooks are down. However this is a slight improvement over the previous implementation as this is only possible during webhook downtime.

## Alternatives Considered

Maintain the current implementation: Rejected as it leaves a wider gap in policy enforcement for the `istio-system` namespace.

For additional alternatives considered on the original issue see [ADR-0003](./0003-exclude-istio-from-policy-engine.md).
