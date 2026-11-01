<!--
Copyright 2026 Defense Unicorns
SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
-->

# Core controller and admission

Core's base package installs the Go controller and Kubernetes CEL admission policies. Standard, slim, HA, and functional-layer distributions inherit this operator through base. Application packages use the same `Package`, `Exemption`, and `ClusterConfig` APIs; they do not select an implementation or provide controller images, namespaces, or migration flags.

## Ownership and admission

The controller owns the complete Package lifecycle, status, and finalization. Production startup enables every reconciliation phase. Partial phase masks exist only inside focused controller tests.

The Helm-owned `uds-system/uds-controller` Package does not depend on its own process for finalization. Helm removes that internal Package with the control plane, and Kubernetes garbage collection removes its owned namespaced resources. This exception requires the exact Core Helm ownership and no SSO or exposed-service cleanup; application Packages retain their normal finalizers.

Base and derived bundles run two controller replicas by default, preserving the previous admission replica count and `system-node-critical` scheduling priority. Both replicas serve admission from synchronized caches, while one elected leader owns reconciliation. Core deployments can override the replica count without changing application packages.

Each replica watches only named platform Secrets and ConfigMaps plus objects labelled `uds.dev/pod-reload=true`. API discovery watches Nodes, the `default/kubernetes` Service, and its EndpointSlices. Pod events do not trigger Package reconciliation. Discovery updates coalesce before recomputing the changed inputs.

Reload watch startup does not restart existing consumers. An object newly entering the reload selector triggers a conservative reload because the filtered watch cannot supply its previous content. Package-owned resource changes target the current owner UID; shared gateway and egress repair signals require the expected platform namespace, API type, and generated resource identity. Removing ownership labels still repairs the previous owner from the watch's old object.

Controller Pod templates request ambient enrollment directly so Istio captures their traffic from creation. Admission must not depend on the controller later enrolling its own namespace: that changes networking underneath live webhook connections during an upgrade. Custom Pod labels cannot disable this control-plane requirement.

Core installs its declared API egress grant before applying its own isolation policies, so it cannot cut off the writer that creates those policies. Installation waits for the controller's own Package to reach its current `Ready` generation before activating replacement callbacks.

Kubernetes evaluates object-local admission checks and defaults. Go handles cluster-dependent admission, topology, advanced custom-resource validation, and compatibility behavior that CEL cannot express. The standard chart uses narrow callbacks so ordinary Pod and Service requests stay in the API server. Both engines resolve exemption authority from the existing protected Exemption resources.

The elected controller reconciles networking, Istio resources, Envoy Gateway routes, Keycloak clients, Authservice configuration, monitoring, probes, and CA bundles. Resources retain their Package UID ownership across an operator upgrade. New Packages receive `uds.dev/finalizer`; Go also completes existing `pepr.dev/finalizer` cleanup without requiring an application change.

Read the [admission contract](native-admission/README.md) for exemption union, JavaScript regex compatibility, revision checks, and controller recovery behavior.

## Installation and upgrade

The regular Core package build creates the static controller image from Go 1.27.3 and records its actual compiler inputs and binary digest. The package contains the image and internal installation helpers for Linux and macOS deployment hosts. No Pepr build, Node controller, or TypeScript module participates in the deployed operator.

Core performs its own ordered installation:

1. Preserve the existing Core API objects and their UIDs while adopting their Helm ownership into `uds-system`.
2. Install Core configuration, infrastructure exemptions, Istio, and Gateway API definitions.
3. Stop and fully drain the previous Core watcher before Go starts reconciling. Other Pepr modules and shared namespaces remain untouched.
4. Start the controller with mesh enrollment, then wait for its own Package networking and compiler-owned exemption snapshot.
5. Register Go callbacks and activate CEL policies.
6. Verify the actual policy and webhook contracts, serving trust, and server-side admission canaries.
7. Retire only the replaced Core module and its old configuration. Shared CRDs and namespaces remain available to other modules.

A failed transition keeps the previous admission authority until replacement verification succeeds. It does not automatically restart a previous writer alongside Go. Installation helpers use the same existing Kubernetes configuration as Zarf, including merged `KUBECONFIG` files and credential plugins. They do not export credentials. Zarf owns the helper files in its temporary package directory and removes that directory on success or handled failure. A short-lived `.uds-core-transition` discovery link is removed before preflight; installation refuses to overwrite an existing directory with that name.

Deployment hosts must run Linux or macOS on amd64 or arm64, have a writable deployment working directory, and allow execution in Zarf's temporary directory. Set Zarf's `--tmpdir` to an executable filesystem if the default uses `noexec`. Windows deployment hosts are not supported by this helper.

If a transition phase fails, retain the error, correct the failed prerequisite, and rerun the complete package against the same cluster. Do not restart the Pepr watcher after writer handoff. Zarf can roll back a failed chart upgrade, but that does not reverse transition actions. A retry repeats readiness and admission checks before retirement. Forced termination may leave temporary helper files; it cannot leave an exported kubeconfig because none is created.

Core retains Java Keycloak and its existing management contract. The controller uses `CLIENT_SECRET` by default and its exact mesh principal, `cluster.local/ns/uds-system/sa/uds-controller`. Dex is a separate identity-provider proposal and is not required by this controller replacement.

Typed, dynamic, and UDS reconciliation clients share the configured Kubernetes API budget. Lease heartbeats use a separate fixed budget of 1 request per second with a burst of 2 and a five-second request timeout, so reconciliation bursts cannot starve leadership renewal.

## Build and tests

Run the controller tests with the pinned compiler and isolated caches:

```bash
GOWORK=off go -C src/go-controller test -race ./...
GOWORK=off go -C src/go-controller vet ./...
```

Build the normal base package from the repository root:

```bash
uds run -f tasks/create.yaml single-layer --with layer=base
```

The source test workflow also exports the pinned pre-replacement revision into an external test directory and executes its original assertions. This frozen compatibility oracle does not add Pepr to Core's dependency graph or runtime. Go differential tests and the existing API/browser integration suites validate the replacement behavior.

## API generation

Canonical schemas and generated TypeScript API models live in the implementation-independent [`src/uds-api`](../uds-api) directory. The Go generator consumes those same schemas and stable naming hints. Regenerate through Core's task and require a second pass to produce identical output:

```bash
uds run -f src/go-controller/tasks.yaml gen-crds
```

Do not hand-edit generated API, client, schema, or documentation output.
