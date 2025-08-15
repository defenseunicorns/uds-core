# 3. Exclude Istio from Policy Engine

Date: 2025-08-12

## Status

Accepted

## Context

Our Kubernetes platform uses a Pepr-based policy engine backed by Kubernetes admission webhooks (mutating and validating) that apply broad protections to pods and other namespaced resources. These policies currently apply to all workloads, including Istio components (Istio CNI, Istiod, and Ztunnel) that are essential to cluster networking. If Pepr admission pods are down/unresponsive, all requests are blocked to "fail closed" and not allow malicious workloads into the cluster.

With the adoption of Istio Ambient and its required CNI plugin, the service mesh is increasingly a foundational dependency for overall cluster health. In particular, when the Istio CNI or related mesh components are unavailable, pod sandbox creation can fail and workloads can’t start. This prevents successful Pepr pod startup, which in turn prevents Istio components from being admitted to the cluster as the webhooks are unreachable. We have observed this risk during:

- Node rotations/rolling updates: Mesh and policy components may be scheduled on the same node, resulting in a "chicken / egg" deadlock if both shutdown/rotate to a new node concurrently.
- Single-node (edge) clusters: On edge clusters the same problem is even more likely to occur. If a node is shut down temporarily for maintenance or otherwise, this problem is almost guaranteed to occur when starting the cluster up again.

While manual recovery from this situation is possible and has previously been documented (see [here](https://github.com/defenseunicorns/uds-core/blob/v0.48.1/docs/reference/troubleshooting/pepr-istiod-webhooks.md)), UDS Core should ideally be able to "self recover" from this situation and not cause unexpected downtime. This is especially important for tactical edge environments where direct CLI/cluster access may not always be possible/easy.

Security-wise, both the Istio CNI and Ztunnel pods are already excluded from a [number of policies](https://github.com/defenseunicorns/uds-core/blob/v0.48.1/src/istio/common/chart/templates/exemptions.yaml) since service mesh needs to run privileged to configure the proper host networking. We also ship Istio with a "hardened" baseline (hardened images and reduced privileges where possible).

## Decision

The `istio-system` namespace will be excluded from Pepr’s admission webhooks, removing policy engine interference with service mesh start-up, recovery, and upgrades. While this does have the potential to reduce security, it is important to note that `istio-system` contains privileged, system/platform workloads, rather than end-user workloads. Our policy engine is primarily meant to prevent end-user workloads ("mission apps") from running with excessive privilege or the ability to escape any controls we have enforced with the service mesh and UDS Operator.

`istio-system` will NOT be excluded from Pepr's watch configuration, allowing us to continue to utilize our UDS Operator interactions with Istio components. Excluding from watch is not required since there is no strict dependency on watch for pod startup/admission.

## Consequences

### Positive

- Improved reliability & bootstrapping: avoids deadlocks during node rotations and cluster upgrades; mesh can recover without policy-induced blocking.
- Better edge support and posture: remove guaranteed failure to reboot on single-node clusters where mesh and policy restarts coincide.
- Faster incident recovery: mesh components (CNI, `ztunnel`, control plane) can start even if policy engine is degraded.

### Negative

- There is potential for configuration drift or upstream supply chain changes resulting in a less secure posture for Istio since `istio-system` will not be covered by policies: While a risk, the Istio chart/manifest defaults have historically been very explicit and least privilege where possible. Additionally, [future Pepr changes](https://github.com/defenseunicorns/pepr/issues/2552) may enable an easy way to statically check the chart against policies (outside of a cluster) in CI.
- A malicious user with access to `istio-system` could run a highly privileged workload there: While a risk, it should be noted that previous exemptions allowed this possibility as well with properly named pods.

## Implementation Details

Our UDS Core Pepr `package.json` will be updated to include `istio-system` in the list of `admission.alwaysIgnore.namespaces`. Testing will be performed to ensure continued full functionality across the system, and validate that the Istio configuration of components is done in a secure way (proper default security contexts, etc).

## Alternatives Considered

1. Maintaining the current manual recovery process: Rejected due to difficulty in edge environments and increasing frequency of this issue.
1. Excluding UDS Policy (Pepr Admission) pods from service mesh: Rejected due to not resolving the problem in testing. Ultimately Istio CNI must be healthy for any pods to properly sandbox, regardless of mesh integration, due to the CNI plugin being used.
1. Utilize other policy tooling to protect `istio-system` separate from Pepr: Rejected as most policy tooling would have the same webhook limitations as Pepr. One potential option would be to utilize the built-in [Pod Security Admission](https://kubernetes.io/docs/concepts/security/pod-security-admission/) for policy enforcement, which would be handled by the API server and remove any downtime concerns. However, the [method of creating exemptions](https://kubernetes.io/docs/tasks/configure-pod-container/enforce-standards-admission-controller/#configure-the-admission-controller) (required for Istio CNI and Ztunnel) being tied to API server configuration does not make this viable for UDS Core.
1. Using the `failurePolicy` on Pepr webhooks to `Ignore` failures during pod downtime: Rejected as this would allow complete policy bypass during admission pod downtime, and allow for malicious workloads to enter the cluster easily. [Upstream Pepr changes](https://github.com/defenseunicorns/pepr/issues/2546) to allow a `failurePolicy` per-namespace would make this a very viable alternative as `istio-system` could be set with a policy of `Ignore`, while other namespaces continue to `Fail`. When available upstream in Pepr this should be adopted.
