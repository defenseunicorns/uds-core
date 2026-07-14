# UDS VM Architecture

Date: July 10, 2026 7:06 AM
Status: Draft

# UDS VM architecture

Author(s): Chance Coleman
Date Created: 2026-07-09

Reviewers:

- [ ]  @Jonathan Volpe
- [ ]  @Joel McCoy
- [ ]  @Wayne Starr

## What UDS VM is

Today, VM workloads run in UDS environments with no standard platform path. Teams that need a VM solve the same integration problems on their own each time: how the workload reaches the network, how the disk image gets into the airgap, and how the workload fits the same security and observability posture as the rest of the platform.

UDS VM is the standalone capability deployed on top of UDS Core to close that gap. It brings VM workloads into the UDS package, policy, and observability model without making UDS Core itself the VM product. VM support is an optional capability, not a universal Core concern, so the runtime, packaging, release cadence, and follow-on feature work should live with the VM capability itself rather than inside the Core repo.

The first iteration focuses on running and integrating VM workloads on top of Kubernetes in UDS environments. It is not trying to replace every capability of a general-purpose hypervisor platform in the first release.

UDS Core still requires a narrow integration point. The current expected Core surface is limited to policy exceptions for required runtime pods, namespace-level secret propagation for the image path, and default VM mutation for required platform annotations. The rest of the capability should ship independently on top of Core.

## Architecture decisions

This section captures the major direction-setting decisions that shape UDS VM as a product. The goal is to document the recommended path and the reason for it, not to state the full implementation design.

### Decision 1: API surface

**Decision:** UDS VM should prefer the runtime's native API over a broad replacement abstraction layer, while still providing opinionated defaults for common VM sizing and configuration.

The first iteration should not introduce a broad UDS-owned replacement API or a new general-purpose VM operator. The default layer should stay narrow: UDS-provided templates, profiles, validated examples, and packaging conventions for the common VM cases. That layer should cover the common VM sizing, storage, and deployment patterns UDS VM chooses to support first. Teams that need something outside that path should still be able to use the runtime's native API directly for workload-specific configuration and edge cases.

- **Full API replacement.** Rejected. A replacement API creates a permanent translation and maintenance burden, breaks direct compatibility with upstream tooling, and turns UDS VM into an API compatibility project rather than a platform capability.
- **Raw upstream CRDs only.** Not recommended. That path is simpler in the short term, but it makes any future abstraction harder once users encode raw manifests directly into automation and GitOps workflows.

### Decision 2: console access

**Decision:** The first iteration should provide browser-based management access for VM workloads.

Prototype work is already tracked in RA-249. The recommended first path is to reuse and harden an existing OSS KubeVirt management UI rather than build a fully custom UDS VM interface in the first iteration. If no OSS option can meet the UDS security and support bar, the fallback path is a Defense Unicorns-owned wrapper or narrower custom UI for the required first-iteration workflows. Browser-based remote access is part of this requirement, but session-brokering tools such as Guacamole solve only the connect portion of the problem and are not a complete substitute for a VM management UI. The current `remote-agent` work is best treated as a source of implementation ideas and reusable UI patterns, not as the architecture answer by itself.

- **Adopt `kubevirt-manager` directly as the product UI.** Rejected. The current project shape does not meet the expected RBAC and hardening bar for UDS Core environments. It would require substantial product work before it could fit the security posture UDS VM needs.
- **Guacamole or another VDI-style interface.** Rejected for the first iteration. That adds a session-brokering layer for a different product problem than the narrow admin-console access UDS VM needs first.

### Decision 3: image distribution model

**Decision:** UDS VM must provide a validated VM image delivery path in the first iteration. The architecture should support more than one delivery pattern because operating system, image size, and deployment conditions are not uniform across the expected use cases.

VM image delivery is a product-level architecture decision because VM disks are much larger than normal container artifacts, disconnected delivery is required in many UDS environments, and the image transport choice affects packaging, upgrades, and validation. Some image formats and import flows also fit poorly into the standard Zarf path without additional handling, especially for larger Windows-class workloads.

The first iteration should ship one validated path per workload class. The current candidates under evaluation are OCI-based delivery, HTTP-based import, and Zarf layerization. OCI-based delivery means shipping VM disk artifacts through an OCI registry flow. HTTP-based import means hosting a VM disk artifact where the cluster can import it directly into storage. Zarf layerization means packaging the VM image content in a more Zarf-native layered form so disconnected transport, reuse across updates, and later VM customization work may fit the UDS model better.

The first-iteration default should be selected against a small set of product criteria:

- It must work in the airgap.
- It must handle the expected Windows and Linux image sizes.
- It must support repeatable validation and release testing.
- It must fit the UDS packaging and upgrade model.

Zarf layerization should be evaluated first because it is the most UDS-specific path explored so far. If it is not ready against those criteria, the first iteration should fall back to OCI-based delivery for Linux-class workloads and HTTP-based import for large Windows-class workloads.

- **Current ecosystem paths.** Supported candidates. OCI-based delivery is the lowest-friction path for Linux and smaller images, and HTTP-based import is the clearest fallback for large Windows images when OCI-based packaging is not practical.
- **Zarf layerization.** Supported candidate under evaluation. This is the most promising path for large-image transport efficiency and update reuse, but it should not be the default without first-iteration validation.

### Decision 4: Windows path

**Decision:** Windows support is a first-iteration requirement and must be validated before the first iteration is complete.

Current customer demand is Windows-heavy, so the first iteration is not complete without a validated Windows path.

**Risk acceptance:** The remaining Windows work is not limited to routine VM validation. The first iteration must validate the Windows path across remote access, image build and import flow in the airgap, and domain-integrated enterprise use cases.

- **Defer Windows validation until after the first platform release.** Rejected. That would ship a platform capability that does not meet the dominant customer VM use case.

### Decision 5: level of UDS Core integration

**Decision:** The first iteration should integrate VM workloads with the key UDS Core platform contracts needed to run them as a real UDS capability, while keeping the Core-side integration surface small. Where deeper integration requires changes inside the VM, the first iteration should define the required integration model without requiring UDS VM to automate all of that work yet.

The middle ground is not "just ship the runtime" and it is not "fully automate everything inside every VM." The first iteration should keep the `uds-core` changes thin and explicit, and put the broader runtime, packaging, validation, and operational work in UDS VM itself. It should also define the minimum in-VM integration contract where required, but it does not need to automate every VM-side step yet.

That first-iteration integration work should include:

- **Networking:** UDS VM should own the supported service exposure path for VM workloads. `Package` should provide the supported in-cluster and exposed service model where possible, and default VM mutation should add the required platform annotations so application teams do not have to manage them directly.
- **Security and policy:** UDS VM should own the supported deployment, privilege, RBAC, and policy model for the runtime components, image delivery path, and exposed VM services. The expected `uds-core` changes here are narrow policy exceptions for required runtime pods rather than a broad new Core policy model.
- **Logging:** The first iteration should own the runtime and platform log path. It should also define the supported path for logs that require software or configuration inside the VM, but it does not need to automate all VM-side log collection work yet.
- **Metrics:** The first iteration should own the platform metrics needed to understand VM state, health, and resource usage through the UDS observability path. It does not need to provide automatic collection of every application metric that may exist inside a VM.
- **Operational workflows:** The first iteration should own the supported path for power and restart actions, troubleshooting, image update handling, and any required browser-based operator workflow already called in scope.

This keeps UDS VM focused on delivering a real UDS capability rather than only a VM runtime. It also keeps the first iteration from expanding into full VM customization and configuration workflows before the core integration model is established.

- **Platform integration outside the VM only.** Rejected. This would leave too much of the UDS integration work to each application team.
- **Full VM-side automation in the first iteration.** Rejected. This would expand the first iteration beyond the core integration model.

### Decision 6: product location

**Decision:** UDS VM should live as Defense Unicorns-authored software in `uds-vm` (`https://github.com/defenseunicorns/uds-vm`) outside `uds-core`, and should not start in `uds-packages`.

UDS VM should be managed in the `uds-vm` repository as its own Defense Unicorns product codebase on top of UDS Core. That product boundary should keep the runtime package, bundle, VM-specific test assets, airgap image declarations, and release tooling together so VM testing, CI, release workflows, and supporting tooling stay in sync.

The current implementation boundary already follows that shape: `uds-core` owns the thin enablement hooks for policy, namespace integration, VM mutation, and capability enablement in the `Package` API, while the VM capability owns the KubeVirt/CDI deployment, VM-specific platform configuration, packaging, tests, and bundle assembly. This capability should ship independently on top of UDS Core rather than as part of the standard Core package because it has its own hardware and runtime prerequisites, support boundary, and release cadence.

- **Ship it from `uds-core`.** Rejected. That makes Core larger for a capability many deployments will never use and weakens the boundary between Core and optional platform capabilities.
- **Ship it from `uds-packages`.** Rejected. That org and packaging pattern fit third-party wrapped products better than a Defense Unicorns-authored capability, and the registry address is hard to change later without customer impact.

### Decision 7: versioning model

**Decision:** UDS VM should version independently from UDS Core. It will still declare a minimum supported Core version because some required integration behavior lives in Core.

- **Version directly with UDS Core.** Rejected. The capability has its own release cadence and should not move only when Core moves.

### Decision 8: package contents

**Decision:** The UDS VM offering should contain the shared platform artifacts required to run the capability, and should leave application-owned VM resources with the application.

UDS VM owns the runtime, shared configuration, and integration assets. It does not own every VM resource a team may deploy on top of it.

- **Put VM workloads into the UDS VM offering.** Rejected. That collapses the line between shared platform capability and application-owned infrastructure.
- **Ship a broad management bundle in the first iteration.** Rejected. The first iteration should stay focused on the runtime and its integration path, not on every ancillary tool in the ecosystem.

## First iteration scope

**In scope:**

- VM image import and delivery into UDS environments
- A validated Windows VM path for UDS deployment conditions
- Browser-based management access for VM workloads
- Integration with UDS Core networking, security, policy, and observability
- Baseline logging, metrics, and operational workflows for VM workloads

This scope focuses on the core platform path. It establishes the capability boundary and the Core integration contract before taking on broader lifecycle or management concerns. The first iteration should include baseline integration rather than only runtime enablement.

**Not in the first iteration:**

- Expanded operational assets such as dashboards and alerting
- GPU and SR-IOV passthrough
- Multi-network VM support

These may become part of the broader UDS VM roadmap, but they are not part of the first iteration scope.

**Out of scope for this design:**

- Hypervisor or bare-metal provisioning
- Virtual desktop infrastructure (VDI) or session brokering
- General-purpose VM lifecycle management

These are either separate product categories or substantial capability areas beyond the initial UDS VM direction.

## Release questions

Some release-gate items still need explicit owners or final decisions before the first iteration release is complete.

- **Image delivery default:** Which path best meets the first-iteration criteria for disconnected delivery, expected image size, repeatable validation, and fit with the UDS packaging model?

## Longer-term questions

These questions do not block the first iteration release, but they shape follow-on design work.

- **Browser UI implementation direction:** Which first supported browser-based management path best fits UDS VM: reuse of an existing OSS KubeVirt management UI, a Defense Unicorns-owned wrapper around that UI, or a more custom implementation?
- **VM integration automation:** Should UDS VM eventually provide an operator or other automation to help teams configure logging, metrics, and other UDS integrations for VMs?
