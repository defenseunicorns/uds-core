# Migration Status: Pepr → Go Controller

Current snapshot of what the Go controller owns vs. what remains in Pepr. Updated as phases move over.

## Moved to Go

### Package CR Lifecycle

All UDS Package reconciliation phases are implemented in the Go controller. Each is individually feature-flag gated — setting the flag to `false` in Pepr hands that phase to Go. See the [Feature Flags table in README.md](./README.md#feature-flags) for the full flag list.

| Phase | Go controller file |
|-------|--------------------|
| Network Policies | `internal/controller/network/policies.go` |
| Authorization Policies | `internal/controller/authpolicy/authpolicy.go` |
| Istio injection (namespace labels) | `internal/controller/istio/injection.go` |
| Istio ingress (VirtualService, ServiceEntry) | `internal/controller/istio/ingress.go` |
| Istio egress (Sidecar/ServiceEntry/AuthzPolicy) | `internal/controller/istio/egress.go` |
| SSO — Keycloak client sync | `internal/controller/sso/keycloak.go` |
| SSO — Authservice chain | `internal/controller/sso/authservice.go` |
| SSO — orphaned client cleanup | `internal/controller/sso/keycloak.go` |
| Pod Monitors | `internal/controller/monitoring/monitors.go` |
| Service Monitors | `internal/controller/monitoring/monitors.go` |
| Uptime Probes | `internal/controller/probes/probes.go` |
| CA Bundle ConfigMap | `internal/controller/cabundle/cabundle.go` |

### Policy Status

The non-root user policy (validate + mutate) has been moved to Go as an example. All other security policies remain in Pepr. Some other validations and mutations have been implemented to support other behaviors that are part of the Package CR reconciliation flow (such as authservice waypoint pod mutations).

## Remains in Pepr

### Security Policies

All security policies except the non-root user example remain in Pepr:

- Privilege escalation prevention
- Capability restrictions
- SELinux options validation
- Seccomp profile enforcement
- ProcMount validation

### Pod Reload

Pepr watches Secrets and ConfigMaps labeled `uds.dev/pod-reload: "true"`, computes checksums on their data, finds pods that reference them (via volumes or env vars), and triggers rolling restarts on the owning controller (Deployment, StatefulSet, DaemonSet) or evicts standalone pods directly. No Go equivalent exists.

### Config and Watch Infrastructure

- **ClusterConfig** — Pepr validates the ClusterConfig CR on admission; the Go controller watches and reconciles it (populates in-memory config via `ClusterConfigController`)
- **Kubernetes API server CIDR** — discovered by watching EndpointSlices/Services in `default/kubernetes`
- **Node CIDRs** — discovered by watching Node objects
- **Identity layer detection** — watches the keycloak Package CR to determine if SSO is deployed
- **Istio gateway restarts** — watches the `istio-system/istio` ConfigMap and restarts gateway pods on change

### CRD Admission Validation

Pepr validates all CRDs on admission: UDSPackage, UDSExemption, and ClusterConfig.

## Known Gaps / Future Work

### Typed clients for every resource

Currently, all Istio resources (VirtualService, ServiceEntry, AuthorizationPolicy, Sidecar, etc.)
and Prometheus resources (PodMonitor, ServiceMonitor, Probe) are managed via `dynamic.Interface`
using `unstructured.Unstructured`. There are available typed clients for both (https://github.com/istio/api,
https://github.com/istio/client-go, https://github.com/prometheus-operator/prometheus-operator).

The main reason for using go-types and typed-clients over `dynamic.Interface` and `unstructured.Unstructured`
is the compile-time feedback if we make a mistake vs. run-time confirmation, which should
further strengthen the reliability. On top of that, the code is simpler to work with,
because all the encoding and decoding is handled by the generated code, which we don't have
to maintain and that again increases confidence and speeds up the development cycles.

### API consistency

Several type mismatches will surface during client generation - for example,
`time.Time` should be replaced with `metav1.Time`, and the same applies to
several other types. The main reason is that all fully-compliant k8s resources
require `DeepCopy` methods, which the native Go types don't have.
In general, API mapping to Go should be done with extreme caution to ensure
interoperability with Kubernetes machinery. In return we will gain strong typing
guarantees and faster and easier development.

### Re-use helpers from kubernetes

We have several places where we "re-invent" the wheel, which was ok when things
were written in Pepr. During transition, we've heavily relied on AI-assistants,
which literally converted all the functions. We should ensure that all those
functions are double checked with what exists in kubernetes. Examples I've run
into:
- ServerSideApply - we have generated clients that already provide that with strong
  type safety guarantees. The entire `internal/resources/resources.go` should be
  removed, and invocations replaced with generated clients.
- Various label and selector helpers.
- Pointer related helpers available under `"k8s.io/utils/ptr"`.
- Caches - a perfect example is ClusterConfigController (`internal/controller/clusterconfig/clusterconfig.go`),
  which only purpose is sync remote value with internal state. This can easily
  be replaced with a direct usage of SharedInformers, which have internal cache
  always up-to-date. Another example is WaypointStore (`internal/store/waypoint.go`),
  again, using `cache.Store` from client-go will save us time and energy required
  for maintaining our own cache implementations, thus increasing speed and reliability.

### No unit tests

Prior Pepr code included comprehensive unit testing across all policies and operator behavior.
The go code has not yet been unit tested (due to dash days time limitations).
Adding unit tests is a must to help identify any edge cases that have not been properly handled already.

### RBAC

Ideally, every controller started from `internal/controller/controller.go` should
have separate, limited ClusterRole, to ensure that it can ONLY operate on the
intended set of resources.

As a reference, check [controller_policy.go](https://github.com/kubernetes/kubernetes/blob/release-1.35/plugin/pkg/auth/authorizer/rbac/bootstrappolicy/controller_policy.go) from Kubernetes which handles ClusterRole and ClusterRoleBinding creations, and
[client_builder_dynamic.go](https://github.com/kubernetes/kubernetes/blob/release-1.35/staging/src/k8s.io/controller-manager/pkg/clientbuilder/client_builder_dynamic.go)
which is responsible for creating a client with designated ServiceAccount matching
to previously created ClusterRoleBinding.

### Good controller example

`internal/controller/udspackage/udspackage.go` is probably the closest to what a
good kubernetes controller should look like in terms of the overall template. The
actual logic of the controller, mostly AI-generated, would need to be carefully
adjusted, to ensure that the logic is coherent and is following all the things
discussed above.

### Gotchas

Due to working with pre-existing API types, we run into interesting problems.
The most notable was with `uds.dev/v1alpha1,Package`, which due to name was causing
us problems when we initially decided to use `Package` as the structure name.
The main problem was that the client generator was then creating a lower-case
variable `package` which is a reserved word in Golang, thus causing problems.
To bypass that problem, we've used `UDSPackage` as the struct name, which was
annotated with `// +resourceName=packages` to let the generator know that it
should use `packages` as the resource name, see `api/uds/v1alpha1/package.go`.
Additionally, we need to ensure the correct mapping in the reverse direction
through `scheme.AddKnownTypeWithName`, see `api/uds/v1alpha1/register.go`.

There may be more gotchas ahead; the ones documented here surfaced specifically
because we created go-types and generated clients for those resource types.
