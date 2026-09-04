# 11. Use UDS CLI Next for main demo bundle CI

Date: 2026-08-26

## Status

Accepted

## Context

UDS Core is the primary consumer for UDS CLI bundle workflows. The main CI paths have historically built, deployed, tested, and published demo bundles with the Legacy UDS CLI bundle commands and `uds-bundle.yaml` files.

UDS CLI Next is available in alpha behind `NextMode` in the updated `uds` binary. It is expected to become the default UDS CLI bundle mode when it reaches beta. Its bundle workflow uses Zarf values for package customization, which overlaps with UDS Core's separate values deploy equivalency workflow.

## Decision

UDS Core will use UDS CLI Next as the main demo bundle CI path where possible. The standard Next bundle will use UDS Core functional layers instead of the monolithic standard package so independent layers can deploy faster.

UDS Core will continue publishing Legacy demo bundles during the transition, but regular CI will focus on the Next bundle path. The separate values deploy equivalency workflow will be removed after the Next bundle path covers the same Zarf values behavior.

## Implementation

This decision uses the following implementation details:

1. Main CI bundle build and deploy jobs use `CLI_FEATURES=NextMode=true` and UDS CLI Next bundle commands.
2. Next bundle definitions live in sibling `*-next` bundle directories, separate from the existing Legacy bundle directories.
3. Standard bundle runtime variants, including HA and private PKI, use CLI Next config files.
4. Next demo bundle artifacts publish alongside Legacy demo bundle artifacts with distinct `-next` names, such as `k3d-core-demo-next` and `k3d-core-slim-dev-next`.
5. Legacy demo bundle validation is covered through the CLI compatibility matrix while Legacy artifacts are still published.

## Consequences

### Positive

- UDS Core dogfoods UDS CLI Next in the workflows it already depends on.
- Main CI validates the future bundle path instead of treating Next mode as a side experiment.
- Published Legacy bundle references remain stable during transition.
- Next bundle artifacts are easy to identify by name.
- Zarf values coverage moves into the bundle workflow that will depend on it long term.

### Negative

- Legacy and Next bundle definitions must stay in sync while both artifact families are published.
- Release workflows publish and report two demo bundle families during the transition.
- Older CLI compatibility workflows stay on Legacy because they intentionally install CLIs that do not support Next mode.

## Alternatives considered

1. **Keep main CI on Legacy and add a separate CLI Next workflow.** Rejected. This would not make UDS CLI Next the real UDS Core bundle path.
2. **Remove Legacy demo bundle validation immediately.** Rejected. Legacy demo bundle artifacts are still published, so release workflows need coverage.
3. **Publish Next bundles with tag suffixes only.** Rejected. Distinct `-next` bundle names make artifact selection clearer.
4. **Keep the separate values workflow indefinitely.** Rejected. CLI Next bundles use Zarf values, so the separate direct package deploy becomes duplicate coverage once the Next bundle path includes the same values behavior.
