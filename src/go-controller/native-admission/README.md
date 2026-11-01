# Core native admission

Core uses Kubernetes native policies and the Go webhook for admission. Its policy, diagnostic, resource, waypoint, name, regex, and Package differential fixtures follow Core 1.16 at `129d6e4a1928ce2b10ba6c5c8b5a0e7350f4053c`, including immutable deletion specifications and generated probe-client reservations. Core requires Kubernetes 1.36 or newer and the complete Go webhook.

## Admission ownership

Kubernetes evaluates the ordinary Pod and Service checks, safe defaults, exemption markers, common diagnostic arrays, Prometheus monitor defaults, Probe isolation, and simple custom resource constraints. Go evaluates trusted Istio image and container classification, JavaScript numeric label semantics, arbitrary diagnostic JSON arrays, JavaScript-only exemption patterns, and advanced `Package`, `Exemption`, and `ClusterConfig` validation. The standard deployment uses narrow registration, avoiding ordinary Pod and Service callbacks while each selected Go request still receives every applicable policy check. Broad registration remains an internal qualification tool.

Both engines derive exemption authority from the protected `Exemption` resources. An annotation or label never grants permission to bypass a policy. Mutation markers report the granted exemption; both engines remove stale markers when they can resolve the policy's current authority.

The source SDK excludes `kube-system`, `pepr-system`, and `zarf` from ordinary policy admission. Go keeps the source's primary exclusion of `istio-system` and its separate complete Istio callback. Native bindings enforce Istio directly. Ordinary `uds-system` resources retain complete Go enforcement and the controller recovery boundary below.

## Callback routing

The standard chart enables native admission and narrow Go callbacks. Core's internal bootstrap phase starts reconciliation before callback registration, waits for the compiled authority, then installs and verifies the complete native contract. Application packages do not configure these phases or select an operator.

The routing annotation `policy.uds.dev/native-fallback` requests complete Go mutation and validation. It cannot grant an exemption. Native mutation writes the current protected snapshot revision when the resource namespace has a JavaScript-only policy scope or the Pod's diagnostic JSON requires Go parsing. Both Go callback match conditions select any nonempty routing value, including a forged or stale value. Native validation delegates a legacy policy only when that annotation equals the current protected revision. Missing or stale routing cannot authorize delegation; both engines continue to resolve grants from protected resources.

The API must evaluate native mutation before remote mutation and both validating stages. The static callback expressions and revision check form one routing contract. Publishing a new legacy scope does not require a webhook configuration update. If the mutating and validating parameter caches observe different revisions, admission may temporarily deny the request while the caches converge. It cannot combine an unselected Go callback with a native legacy bypass. Revocation removes the protected grant first; native mutation then removes obsolete routing, and ordinary native checks enforce the new snapshot.

Every parameterized Pod and Service mutator writes `policy.uds.dev/native-mutation-revision`. The corresponding validator requires that stamp to equal its current protected snapshot revision. Selected Go callbacks also compare the stamp against the revision pinned with their full grant evaluator. A mismatch denies the request for retry before Go changes defaults or permits admission. This fence prevents an older mutator from forcing non-root defaults onto a root workload that a newer validator exempts. The stamp never grants a policy exemption; native mutation overwrites tenant values and both validators still evaluate protected grants.

Narrow registration selects these request shapes:

| Request | Go mutation | Go validation |
|---|---|---|
| Ordinary Pod or Service | No | No |
| Ordinary `uds-system` resource | Complete | Complete |
| JavaScript-only exemption scope | Complete | Complete |
| Pod with nonempty `uds/user`, `uds/group`, or `uds/fsgroup` | Complete | Native, unless another Go shape applies |
| Pod containing `istio-proxy` or `istio-init`, including init and ephemeral containers | Native, unless another Go shape applies | Complete |
| Diagnostic array containing unknown JSON values, escaped strings, or malformed JSON | Complete | Complete |

Native mutation preserves the order and duplicates of diagnostic arrays containing the three known default names, handles JSON whitespace, and appends only absent policy names. Go preserves arbitrary valid JSON array entries and rejects invalid array inputs with the existing mutation error semantics. Its compatibility path decodes validated JSON into data values and calls only built-in JavaScript array and stringify operations, preserving source key order, numeric normalization, Unicode, and string escaping. It never evaluates user programs or Core TypeScript. Tenant-authored routing and exemption markers never replace either evaluator's grant lookup.

Ambient Pod and Service topology callbacks remain separate from policy callbacks and run on both creation and update. They correlate the selected route with the raw `Package` UID and a converged waypoint entry. A fresh replica denies selected requests for retry when declared SSO topology has no matching entry. Failed desired updates retain the previous converged route; an ownership journal can require a retry but cannot create routing authority. Finalizing Packages retain that fence until actual informer deletion. Ordinary resources without selected SSO topology and the pinned actual-waypoint shape remain available.

The controller labels existing workloads before publishing `Ready`. Its authenticated `uds-system/uds-controller` identity may perform only an owner-correlated label repair or retirement with unchanged object identity, owner references, specification, and unrelated labels. This exception belongs only to the topology mutator; native and Go policy enforcement still applies. It prevents a convergence deadlock without granting a general controller admission bypass.

## Grant publication and revocation

The elected compiler publishes one `AdmissionParameters` object, `uds-policy-exemptions/uds-native-grants`. It watches that output for deletion, replacement and specification changes, then rebuilds it from the protected `Exemption` cache. This repair does not require another admitted `Exemption` change or a controller restart. Its `nativeMatchers` list contains the OR-union of grants. Its `legacyScopes` list delegates each namespace and policy that uses a JavaScript-only pattern to the complete Go evaluator. Each grant retains its resource UID as ownership identity.

The revision hash includes native grants and the original owner UID and pattern for every legacy grant. Changing a legacy expression or removing one grant changes the revision even if another grant retains the same delegated namespace and policy. Source ordering does not change the hash.

The compiler replaces the entire snapshot after informer and configuration changes. An empty valid snapshot enforces every policy without exemptions. A malformed or untrusted snapshot causes the compiler to publish empty lists with `valid: false` and return an error. The Go store also clears grants atomically on invalid input. These steps revoke earlier permission rather than keeping an older valid authorization active.

Parameterized Pod and Service bindings use `parameterNotFoundAction: Deny`. Missing parameters deny ordinary tenant admission. The protected parameter object and the source namespace require privileged ownership; tenant actors must not receive write access to either.

## Controller recovery boundary

Fail-closed admission cannot call an unavailable webhook to recreate that webhook. Kubernetes also resolves policy parameters before evaluating match conditions, so an exception inside a parameterized policy cannot recover a missing parameter object.

The profile uses a narrow control-plane recovery path. Parameterized Pod and Service bindings exclude `uds-system`. The complete Go webhook still validates ordinary resources in that protected namespace. When Go is unavailable, ordinary `uds-system` requests fail closed.

Only the exact controller recovery shape can avoid a remote callback. The API server must authenticate a Kubernetes controller or an actor in `system:masters`. The Pod must use namespace `uds-system`, ServiceAccount `uds-controller`, the controller name prefix, a controlling `apps/v1` ReplicaSet owner with that prefix, one container named `controller`, and no init or ephemeral containers. Numeric identity label overrides use ordinary Go admission rather than recovery. The Service must have the exact controller name, type `ClusterIP`, and the serving port mapping. A tenant-supplied label, name, owner reference, or ServiceAccount field alone cannot satisfy this boundary.

Mandatory native recovery policies apply all three Pod defaults and enforce all 16 Pod and two Service checks without an `AdmissionParameters` dependency. The chart installs these recovery policies even when you disable `nativeAdmission.enabled` for Go qualification. The recovery path does not consume exemptions or delegate any policy to the unavailable webhook. You must retain the canonical protected controller workload and its restrictive security context.

This boundary deliberately trades parameterized admission in the protected control-plane namespace for independent controller recovery. It does not weaken tenant namespace enforcement or turn an unavailable Go endpoint into an allow response.

## Serving trust and staged registration

The chart reuses `uds-system/uds-controller-serving-certificate` when it exists. On first install it generates one certificate, uses the same public CA in every registration, and creates the shared Secret before the controller Deployment. The runtime also resolves concurrent Secret creation through the winning shared object.

Each replica validates the key pair, CA chain, expiration, and serving hostname. The serving manager reconciles existing owned webhook registrations every two seconds, including later registration, chart overwrites, and Secret rotation. HTTPS `/readyz` reports certificate and registration trust convergence. Absent registrations allow backend startup before admission registration; the activation sequence must verify that all complete Go registrations exist before enabling native delegation.

During rotation, the manager records the previous authority in the shared Secret's rotation metadata and publishes both old and new trust. It waits five seconds for trust propagation before switching its serving leaf. Existing replicas retain their valid old leaf during that interval; newly started replicas wait before joining the Service. After one minute, the manager removes the previous root. Invalid key pairs, roots, or hostnames make readiness fail and prevent successful TLS handshakes. The serving context also fences responses during shutdown.

Core's package manages bootstrap and activation internally. The backend starts before admission registration, with mandatory recovery policies already installed. The installer waits for serving readiness and a valid compiler-owned snapshot, then registers complete Go callbacks and activates native admission. It verifies the actual native and Go contracts plus admission canaries before retiring the previous Core callbacks. The previous watcher is fully drained before Go reconciliation begins.

## Rendering and qualification

`render.py` owns the generated policy manifests, chart policy files, and parameter CRD copy. `bootstrap.py` owns the shared authenticated recovery expressions. `routing.py` owns the static callback routing expressions and generated chart helper. Run the renderer after changing these sources.

The frozen upstream suite runs all 1,117 assertions unchanged. Six capture adapters execute 372 tests and record 410 admission cases, plus 1,008 JavaScript regular expression cases, against the current Core source on Node 26.13.0. The Go differential tests check all 1,418 cases and require the expected counts and source revision; they fail if a fixture or adapter is missing.

The API qualification must verify CEL types and actual mutation behavior. Mutating admission policies do not expose the same type-checking status as validating admission policies. Dry-run Pod, ephemeral container update, monitor, Service, revocation, malformed snapshot, and missing parameter cases provide behavioral evidence. Positive controller recreation and negative forged ownership tests must accompany recovery changes.

## Related documentation

Use these source contracts and manifests when checking admission behavior:

- [Policy contract](policies.json) defines the deployed native checks.
- [Go resource validators](../internal/admission/resources/) defines the advanced validation contracts.
- [Controller chart](../chart/) contains the complete webhook routing and mandatory recovery policies.
