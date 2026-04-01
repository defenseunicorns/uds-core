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

### No typed clients for Istio or Prometheus

All Istio resources (VirtualService, ServiceEntry, AuthorizationPolicy, Sidecar, etc.) and Prometheus resources (PodMonitor, ServiceMonitor, Probe) are managed via `dynamic.Interface` using `unstructured.Unstructured`. Upstream typed clients or controller-gen-produced clients are not used. This is future work.

### No unit tests

Prior Pepr code included comprehensive unit testing across all policies and operator behavior. The go code has not yet been unit tested (due to dash days time limitations). Adding unit tests would likely help identify any edge cases that have not been properly handled already.
