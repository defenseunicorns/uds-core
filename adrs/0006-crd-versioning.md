# ADR: CRD Versioning

Date: 2026-01-27

## Status

Accepted

## Context

UDS Core defines several Custom Resource Definitions (CRDs) that are currently all versioned as v1alpha1 (Package, Exemption, ClusterConfig). As UDS Core approaches its 1.0 release, there's need to establish a clear policy for CRD versioning, lifecycle management, and backwards compatibility guarantees. This is critical for providing stability to our users and ensuring predictable upgrade paths.

## Decision

UDS Core will follow the **Kubernetes-native CRD versioning strategy** as defined in the [Kubernetes API deprecation policy](https://kubernetes.io/docs/reference/using-api/deprecation-policy/) and [CRD versioning documentation](https://kubernetes.io/docs/tasks/extend-kubernetes/custom-resources/custom-resource-definition-versioning/). This approach provides the strongest backwards compatibility guarantees.

The Kubernetes-native CRD versioning principles have been are outlined in the [Versioning Levels and Guarantees](#Kubernetes-native-CRD-versioning-principles) section below.

UDS Core 1.0 will be released with all the CRDs promoted to v1beta1. This provides guaranteed backwards compatibility for production workloads and ensures that users can confidently build on UDS Core APIs knowing the stability contract.

## Consequences

### Positive

- Strong backwards compatibility for production workloads
- Predictable upgrade paths aligned with Kubernetes ecosystem best practices
- Users can confidently build on UDS Core APIs knowing the stability contract
- Familiarity for users already accustomed to Kubernetes API versioning

### Negative

- CRD schema evolution will require implementing a [Conersion Webhook](https://kubernetes.io/docs/tasks/extend-kubernetes/custom-resources/custom-resource-definition-versioning/#configure-customresourcedefinition-to-use-conversion-webhooks)
- Long deprecation periods and increased maintenance burden to keep removed/renamed fields in the CRD schema

## Alternatives Considered

The YouTube talk "[The Missing Talk About API Versioning & Evolution in Your Developer Platform](https://www.youtube.com/watch?v=pHRQpqCEvU8)" presents several alternative patterns for CRD versioning that prioritize faster iteration:

* Using different `apiVersion` fields (e.g. `group.v1/v1`, `group.v2/v1`) for new CRD versions
* Using embedded versions in the CRD `spec` (e.g. `spec.v1`, `spec.v2`) for the new API versions

These approaches have been designed to enable rapid iteration and provide minimal backwards compatibility guarantees. Therefore, they are not suitable for UDS Core.

The last approach considered is using `x-kubernetes-preserve-unknown-fields` annotation. This approach is strongly discouraged by the Kubernetes community and is not recommended for production use.

## Kubernetes-native CRD versioning principles

This paragraph contains information related to the UDS Core based on [Kubernetes API deprecation policy](https://kubernetes.io/docs/reference/using-api/deprecation-policy/) and [CRD versioning documentation](https://kubernetes.io/docs/tasks/extend-kubernetes/custom-resources/custom-resource-definition-versioning/). It's intended to be a concise summary of the principles that govern UDS Core CRD versioning.

### Core Versioning Principles

1. **API elements may only be removed by incrementing the version**: Once a field is added to a CRD version, it cannot be removed from that version or have its behavior significantly changed.

2. **Round-trip compatibility**: API objects must be able to round-trip between API versions without information loss. For example, an object written as v1beta1 can be read as v1beta2, converted back to v1beta1, and remain identical to the original.

3. **Version stability ordering**: A CRD version may not be deprecated in favor of a less stable version. GA versions can replace beta and alpha, beta can replace earlier beta and alpha, but alpha can only replace earlier alpha versions.

4. **Storage version management**: The preferred/storage version cannot advance to a new version until after a release has been made that supports both the new version and the previous version. This ensures users can upgrade and rollback safely.

### CRD versions

**Alpha (v1alpha1, v1alpha2, etc.)**
- Fields may be added, removed, or renamed without notice
- No schema compatibility guarantees between alpha versions
- May be removed in any UDS Core release without prior deprecation
- Suitable for experimental features and rapid iteration
- Users should expect breaking changes

**Beta (v1beta1, v1beta2, etc.)**
- Schema is well-tested and considered stable
- Fields may only be removed or have breaking changes with proper deprecation
- Must be deprecated for a minimum of 9 months or 3 UDS Core minor releases (whichever is longer)
- After deprecation, must remain supported for a minimum of 9 months or 3 UDS Core minor releases (whichever is longer) before removal
- Breaking changes require incrementing the beta version (v1beta1 → v1beta2)
- Beta versions must support conversion to/from other served versions

**GA/Stable (v1, v2, etc.)**
- Considered production-ready with strong stability guarantees
- May be marked as deprecated but must not be removed within a major version of UDS Core
- Breaking changes require incrementing to a new major API version (v1 → v2)
- All v1 APIs must support bidirectional conversion to newer versions
- Removal requires a UDS Core major version bump
