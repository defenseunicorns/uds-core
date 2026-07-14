# UDS VM architecture Joel comments

This file captures Joel's review comments on `uds-vm-architecture-notion.md` and ties them to the current state of `uds-vm-architecture.md`.

## Comment 1

**Original comment text:**

`UDS VM must provide a validated VM image delivery …`

`Can we explain the problem here a bit more about why we need to make a decision on this from a high level technical side.  Storage considerations, vm file formats not natively working with zarf, etc.`

**Associated section:** Decision 3, image distribution model

**What changed in `uds-vm-architecture.md`:**

- `Decision 3` now explains why VM image delivery is a product-level architecture decision.
- It now calls out large VM disks, disconnected delivery, and the way transport choice affects packaging, upgrades, and validation.
- It now explicitly notes that some image formats and import flows fit poorly into standard Zarf workflows.

**Still open:**

- Nothing significant. This comment looks addressed.

## Comment 2

**Original comment text:**

``OCI-based delivery, HTTP-based import, and Zarf la…``

`can we explain what these things mean? I think they can be loosely interpreted here`

**Associated section:** Decision 3, image distribution model

**What changed in `uds-vm-architecture.md`:**

- `Decision 3` now defines `OCI-based delivery`, `HTTP-based import`, and `Zarf layerization` in plain language.

**Still open:**

- Nothing significant. This comment looks addressed.

## Comment 3

**Original comment text:**

``while still providing opinionated defaults for com…``

`How did you envision this would be done?`

**Associated section:** Decision 1, API surface

**What changed in `uds-vm-architecture.md`:**

- `Decision 1` now says the first iteration should not introduce a broad replacement API or a new general-purpose VM operator.
- `Decision 1` now defines the default layer as templates, profiles, validated examples, and packaging conventions for supported common VM patterns.
- `Decision 1` now says edge cases and workload-specific configuration can still go directly to the runtime API.

**Still open:**

- The doc still does not name a concrete implementation artifact beyond that level, for example whether this shows up as packaged manifests, curated examples, or another thin defaulting layer. That may be acceptable for an architecture doc, but it is the remaining edge of this comment.

## Comment 4

**Original comment text:**

`brings VM`

`I think it is worth calling out that the current direction or initial scope is that this product focuses solely on running VM workloads on top k8s (maybe this can change?).  I don’t think we are trying to create a product at the moment that can completely replace hypervisor like solutions like VMWare.  (or maybe we need to consider this long long term?). UDS VM in this initial architecture and scope would be ideal for environments and workloads that include some VMs but probably not managing 1000s+ VMs on an enterprise level.`

**Associated section:** What UDS VM is

**What changed in `uds-vm-architecture.md`:**

- `What UDS VM is` now says the first iteration focuses on running and integrating VM workloads on top of Kubernetes in UDS environments.
- It now explicitly says the first release is not trying to replace every capability of a general-purpose hypervisor platform.

**Still open:**

- The doc does not explicitly mention the `1000s+ VMs` scale example. That is probably fine unless you want that exact boundary called out.

## Comment 5

**Original thread text:**

- `Would be worth calling out that there already is an issue to build a prototype of a browser based management UI here - https://linear.app/defense-unicorns/issue/RA-249/kubevirt-vm-integration`
- `(it will be a requirement for the customer asking for this - I am ok with this current direction / easing into it but this is something we will want to have to meet their needs)`
- `We definitely didn’t ask the delivery folks we interviewed about needing something in this realm of UI things. So you’re saying this would probably be an early requirement? more concretely a fast follow to initial implementation.`
- `From what I am tracking on Fleet use cases it would be (since that would be delivered beyond Delivery there)`
- `I need to put some more thought into this since I hadn’t realized how important it might be. It sounds like this is at least a fast-follow requirement, if not something we need to treat as part of the first iteration.`
- `updated this in the doc. it now says browser-based management access is required either in iteration 1 or as a fast follow, and I added a note that prototype work is already tracked in RA-249.`
- `I agree that this needs to be shipped in the first iteration. I think we can go as far as deciding the general path we want to go down.  Do we need to build our own interface in UDS VM? Can we repurpose something open source? Does the remote agent work become obsolete if we build something in UDS VM? Or do we just use remote agent’s implementation to do these things?`
- `I think deciding the general path we go down can be documented in this doc as it will scope the amount of work needed to meet this requirement.  @Chance Coleman I know you are playing with this now, can we provide some options/recommendations for this based on your discovery in this doc?`

**Associated section:** Decision 2, console access

**What changed in `uds-vm-architecture.md`:**

- Browser-based management access is now in first-iteration scope.
- `Decision 2` now ties the requirement to `RA-249`.
- `Decision 2` now says the current direction is OSS reuse before custom UI.
- `Decision 2` now calls out `remote-agent` as an implementation donor rather than the architecture answer.

**Still open:**

- This is still the biggest open comment.
- The doc does not yet lock down what UI level iteration 1 requires.
- The doc also should not finalize OSS recommendations until you align with Wayne and Joel on whether `browser-based management access` means a narrower browser access path or a fuller VM management UI.

## Comment 6

**Original thread text:**

- `I think this makes sense but it may be good to be more explicit here about what this means (it seems squishy to me the way it is worded right now) - I think that UDS Core does a decent job in its design striking this balance - most applications never really need to worry about explicit Istio resources for example but that API is always there as a fallback - that lets us do significant swaps (like sidecar→ambient) without impacting every application integrated with it - IMO we would want to do something similar here in UDS VM - be able to answer to 80+% of VMs but not block out fallbacks for other kinds of workloads.`
- `thats good feedback. Something more like The current implementation direction under evaluation is to provide opinionated UDS defaults for the common VM cases, while preserving the runtime's native API as an escape hatch for workloads that do not fit the default path. maybe? gets a bit closer to that not full abstraction but also not raw upstream only.`
- `Yeah I think that is more clear for sure.`
- `I think we can be more specific here too. I know we are trying to stay high level, but I’m confused what this means as far as implementation.  Are we suggesting the need to manage a new operator for certain things? If so, what might those new things might be?`

**Associated section:** Decision 1, API surface

**What changed in `uds-vm-architecture.md`:**

- `Decision 1` now says the first iteration should not introduce a broad replacement API or a new general-purpose VM operator.
- `Decision 1` now defines the default layer as templates, profiles, validated examples, and packaging conventions for the supported common VM patterns.
- `Decision 1` now says workload-specific configuration and edge cases can still go directly to the runtime API.

**Still open:**

- The operator question is addressed directionally by saying a new general-purpose VM operator is not part of iteration 1.
- If you want to go further, the next level of specificity would be to name the expected first-iteration implementation shape for those defaults.

## Comment 7

**Original comment text:**

`I’m not sure I fully understand this question. What are we talking about with zarf layerization? Can we dumb this down and explain the problem and what decision we need to make?`

**Associated section:** Release questions, image delivery default

**What changed in `uds-vm-architecture.md`:**

- `Decision 3` now explains why VM image delivery is a product-level architecture problem.
- `Decision 3` defines `OCI-based delivery`, `HTTP-based import`, and `Zarf layerization` in plain language.
- `Release questions` now states the pending decision in terms of first-iteration criteria rather than only naming transport options.

**Still open:**

- Nothing significant. This comment looks addressed.

## Comment 8

**Original comment text:**

`logging, metrics, and day-two operations` can we also be more specific here?

**Associated section:** First iteration scope and Decision 5

**What changed in `uds-vm-architecture.md`:**

- `Decision 5` now breaks operational work into explicit areas: power and restart actions, troubleshooting, image update handling, and browser-based operator workflow already called in scope.
- `First iteration scope` now includes baseline logging, metrics, and operational workflows for VM workloads.

**Still open:**

- Nothing significant. This comment looks addressed at the architecture level.

## Comment 9

**Original comment text:**

`security, policy, and observability` can we list the specific things here. this can be very loosely interpreted. I want to know the technical work that we plan to get after as far as integration points with UDS

**Original follow-up detail:**

- `Networking - UDS Package CR SHOULD provide all in cluster networking/expose capes. Integration with UDS Service Mesh is a MUST with similar level of security policies`
- `Logging - Requires some sort of way to get an agent on VMs. How might we do this and is this in scope?`
- `Metrics - Probably can just be done with UDS Package metrics things? Or what metrics are we talking about here?`
- `etc.`

**Associated section:** First iteration scope and Decision 5

**What changed in `uds-vm-architecture.md`:**

- `Decision 5` now names the integration points directly: networking, security and policy, logging, metrics, and operational workflows.
- `Decision 5` now distinguishes platform-side ownership from the defined but not fully automated in-VM integration path.
- Networking, logging, and metrics now call out the specific first-iteration expectations more clearly.

**Still open:**

- The service mesh part is still intentionally careful. The doc says iteration 1 must define whether VM traffic follows the standard service mesh path or documented exceptions, rather than pretending that answer is already closed.

## Comment 10

**Original comment text:**

`Browser-based admin console` probably should be in first iteration based on discussions

**Associated section:** First iteration scope

**What changed in `uds-vm-architecture.md`:**

- Browser-based management access moved into `In scope`.
- It was removed from `Not in the first iteration`.

**Still open:**

- The scope alignment is done, but the actual meaning of that browser-based scope is still open under Comment 5.

## Comment 11

**Original comment text:**

`UDS VM should live as Defense Unicorns-authored so… I think we can be more specific here. This calls out what it is not basically… But I think we can say we manage this product in a monorepo called X that lives in X. We are doing this because of things like:`

- `Keeps VM testing/ci/release capeabilities/tools in sync (as there are likely many things that may go into this product like multiple opensource applications and potentially CLI like VM building capes)`
- `UDS VM should live outside of core to reduce maintenance burden. Most UDS Core Users are going to want this shipped. Even as an optional layer we would have to exclude this from the standard package. UDS VM operates under prerequisites that UDS Core. It requires certain hardware. We should version and ship this independently as a thing that goes on top of core that has it’s own set of prerequisites.`

**Associated section:** Decision 6, product location

**What changed in `uds-vm-architecture.md`:**

- `Decision 6` now says UDS VM should be managed as its own Defense Unicorns product codebase on top of `uds-core`.
- `Decision 6` now names the repository directly as `uds-vm` and records its location as `https://github.com/defenseunicorns/uds-vm`.
- `Decision 6` now says the runtime package, bundle, VM-specific test assets, airgap image declarations, and release tooling should live together so VM testing, CI, release workflows, and supporting tooling stay in sync.
- `Decision 6` now uses the current implementation boundary more concretely: `uds-core` owns the thin enablement hooks, while the VM capability owns the KubeVirt/CDI deployment, VM-specific platform configuration, packaging, tests, and bundle assembly.
- `Decision 6` now explains more directly why the capability should ship independently on top of UDS Core rather than as part of the standard Core package.

**Still open:**

- Nothing significant. This comment now looks addressed.

## Comment 12

**Original comment text:**

`This whole paragraph feels a bit contradictory? It looks like you are trying to establish a middle ground here between saying this is just a zarf package and giant do everything VM platform? But what is the actual middle ground here? What is the decision/path forward here?`

**Original follow-up detail:**

- `I think we can get a little technical and specific here for all the integration points too and call out why they are needed:`
- `Networking - UDS Package CR SHOULD provide all in cluster networking/expose capes. Integration with UDS Service Mesh is a MUST with similar level of security policies`
- `Logging - Requires some sort of way to get an agent on VMs. How might we do this and is this in scope?`
- `Metrics - Probably can just be done with UDS Package metrics things? Or what metrics are we talking about here?`
- `etc.`

**Associated section:** Decision 5, level of UDS Core integration

**What changed in `uds-vm-architecture.md`:**

- `Decision 5` now states the middle ground explicitly: own platform-side integration work in iteration 1, define but do not fully automate every VM-side step.
- Each integration area now says more clearly what UDS VM owns in the first iteration and what remains a defined contract rather than automated implementation.

**Still open:**

- Nothing major beyond the still-open service mesh and UI-shape questions already called out under Comments 5 and 10.

## Summary

The main unresolved areas after these doc updates are:

- Comment 5: what `browser-based management access` actually means for iteration 1
- Comment 11: the exact repo shape remains open by design, so the doc only records the ownership boundary and rationale
