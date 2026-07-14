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

UDS Core still requires a narrow integration point. The recommended direction is to keep that integration small and explicit, while the rest of the capability ships independently on top of Core.

## Architecture decisions

This section captures the major direction-setting decisions that shape UDS VM as a product. The goal is to document the recommended path and the reason for it, not to state the full implementation design.

### Decision 1: API surface

**Decision:** UDS VM should prefer the runtime's native API over a broad replacement abstraction layer, while still providing opinionated defaults for common VM sizing and configuration.

The current implementation direction under evaluation is to provide opinionated UDS defaults for the common VM cases, while preserving the runtime's native API as an escape hatch for workloads that do not fit the default path.

- **Full API replacement.** Rejected. A replacement API creates a permanent translation and maintenance burden, breaks direct compatibility with upstream tooling, and turns UDS VM into an API compatibility project rather than a platform capability.
- **Raw upstream CRDs only.** Not recommended. That path is simpler in the short term, but it makes any future abstraction harder once users encode raw manifests directly into automation and GitOps workflows.

### Decision 2: console access

**Decision:** The first iteration should provide a simple admin access path, but browser-based management access is required either in the first iteration or as a fast follow.

This is sufficient for early platform validation, but it is not a complete long-term answer for operator workflows. If browser-based console access is not part of the first iteration, it is a required fast follow. Prototype work is already tracked in [RA-249](https://linear.app/defense-unicorns/issue/RA-249/kubevirt-vm-integration). The current implementation direction under evaluation is a CLI-based console path.

- **KubeVirt Manager.** Rejected. The current project shape does not meet the expected RBAC and hardening bar for UDS Core environments. It would require substantial product work before it could fit the security posture UDS VM needs.
- **Guacamole or another VDI-style interface.** Rejected for the first iteration. That adds a session-brokering layer for a different product problem than the narrow admin-console access UDS VM needs first.

### Decision 3: image distribution model

**Decision:** UDS VM must provide a validated VM image delivery path in the first iteration. The architecture should support more than one delivery pattern because operating system, image size, and deployment conditions are not uniform across the expected use cases.

The first iteration should ship one validated path per workload class. The current candidates under evaluation are OCI-based delivery, HTTP-based import, and Zarf layerization. Zarf layerization should be evaluated first because it is the most UDS-specific path explored so far. It addresses two problems the other paths do not address well: cross-version transport efficiency for very large disks and VM customization needed for better UDS integration over time. If Zarf layerization is not ready, the first iteration should fall back to OCI-based delivery for Linux-class workloads and HTTP-based import for large Windows-class workloads.

- **Current ecosystem paths.** Supported candidates. OCI-based delivery is the lowest-friction path for Linux and smaller images, and HTTP-based import is the clearest fallback for large Windows images when OCI-based packaging is not practical.
- **Zarf layerization.** Supported candidate under evaluation. This is the most promising path for large-image transport efficiency and update reuse, but it should not be the default without first-iteration validation.

### Decision 4: Windows path

**Decision:** Windows support is a first-iteration requirement and must be validated before the first iteration is complete.

Current customer demand is Windows-heavy, so the first iteration is not complete without a validated Windows path.

**Risk acceptance:** The remaining Windows work is not limited to routine VM validation. The first iteration must validate the Windows path across remote access, image build and import flow in the airgap, and domain-integrated enterprise use cases.

- **Defer Windows validation until after the first platform release.** Rejected. That would ship a platform capability that does not meet the dominant customer VM use case.

### Decision 5: level of UDS Core integration

**Decision:** The first iteration should integrate VM workloads with UDS Core networking, security, policy, logging, metrics, and operational workflows. Where deeper integration requires changes inside the VM, the first iteration should define the required integration model without requiring UDS VM to automate all of that work yet.

This keeps UDS VM focused on delivering a real UDS capability rather than only a VM runtime. It also keeps the first iteration from expanding into full VM customization and configuration workflows before the core integration model is established.

- **Platform integration outside the VM only.** Rejected. This would leave too much of the UDS integration work to each application team.
- **Full VM-side automation in the first iteration.** Rejected. This would expand the first iteration beyond the core integration model.

### Decision 6: product location

**Decision:** UDS VM should live as Defense Unicorns-authored software outside `uds-core`, and should not start in `uds-packages`.

UDS VM is not a third-party upstream wrapper in the same sense as the packages that normally live in `uds-packages`. It has its own roadmap, release decisions, and integration contract into Core.

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
- Integration with UDS Core security, policy, and observability
- VM integration with logging, metrics, and day-two operations

This scope focuses on the core platform path. It establishes the capability boundary and the Core integration contract before taking on broader lifecycle or management concerns. The first iteration should include baseline integration rather than only runtime enablement.

**Not in the first iteration:**

- Browser-based admin console
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

- **Image delivery default:** Is Zarf layerization ready enough to ship in the first iteration, or should the first iteration standardize on OCI containerdisk and CDI HTTP import while Zarf layerization continues as follow-on work?

## Longer-term questions

These questions do not block the first iteration release, but they shape follow-on design work.

- **Browser console direction:** If UDS VM later adds browser-based console access, what RBAC and hardening should it use in UDS environments?
- **VM integration automation:** Should UDS VM eventually provide an operator or other automation to help teams configure logging, metrics, and other UDS integrations for VMs?