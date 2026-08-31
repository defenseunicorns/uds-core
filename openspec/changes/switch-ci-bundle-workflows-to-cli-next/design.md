## Context

See `proposal.md` for motivation and `specs/ci-cli-next-bundles/spec.md` for required behavior. UDS Core currently builds and deploys demo bundles from `uds-bundle.yaml` with Legacy bundle commands such as `uds create`, `uds deploy`, and `uds publish`. The shared setup installs a pinned `uds` binary, and CI workflows call Maru tasks in `tasks/create.yaml`, `tasks/deploy.yaml`, `tasks/test.yaml`, and `tasks/publish.yaml`.

UDS CLI Next is enabled in the updated `uds` binary with `CLI_FEATURES=NextMode=true` or `--features=NextMode=true`. Next bundle workflows use `bundle.uds.hcl` and commands under `uds bundle`, including `uds bundle create`, `uds bundle deploy`, and `uds bundle push`. CLI Next bundles use Zarf values as the configuration path for package customization. Existing `uds-bundle.yaml` bundle files remain the Legacy source of truth for Legacy bundle artifacts until the transition ends.

UDS Core currently has separate Zarf values equivalency coverage through `test:uds-core-values-e2e`, triggered as `test_type: values` from the package test workflow. That path builds the standard package, deploys it directly with `./uds zarf package deploy --values test/values/k3d-standard/values.yaml`, and then runs validation and e2e tests. Once the main CLI Next bundle deploy applies the equivalent values configuration, the separate values workflow becomes redundant.

## Goals / Non-Goals

**Goals:**

- Replace existing main CI bundle build and deploy paths with CLI Next where possible.
- Keep the Next bundle source files in sibling `*-next` bundle directories, separate from the current Legacy bundle files.
- Publish CLI Next demo bundles alongside Legacy demo bundles with distinct `-next` artifact names, for example `k3d-core-demo-next`.
- Fold Zarf values deploy coverage into the CLI Next bundle path and remove the separate values-only workflow from regular PR CI.
- Keep Legacy bundle publishing during release workflows and cover Legacy deployment through the CLI compatibility matrix while Legacy artifacts are still published.
- File CLI Next follow-up issues only for blockers encountered while replacing current UDS Core workflows.
- Add an ADR that records the implementation and transition decisions.

**Non-Goals:**

- Adding special CI coverage for CLI Next commands that UDS Core does not already need for build, deploy, or publish workflows.
- Removing Legacy demo bundle artifacts from release publishing during this change.
- Moving bundle files into new directories solely because they are Next-mode inputs.
- Treating CLI Next as a separate binary.

## Decisions

### Decision 1: Add Next bundle files next to Legacy bundle files

Each converted demo bundle keeps the Legacy `uds-bundle.yaml` in the existing directory and keeps the Next-mode files in a sibling `*-next` directory, starting with `bundle.uds.hcl`. The standard Next bundle uses the functional layer packages (`core-crds`, `core-base`, `core-identity-authorization`, `core-logging`, `core-monitoring`, `core-runtime-security`, `core-backup-restore`, `core-portal`, and `core-metrics-server`) with explicit `depends_on` edges. Use additional local files such as `defaults.uds.hcl`, `config.uds.hcl`, or values files only where needed to represent existing bundle defaults and deploy-time configuration.

Rationale: The user intent is to keep bundle files in the same folder and publish a different bundle name, not create a parallel directory tree. This also makes it easier to review whether Legacy and Next definitions represent the same demo bundle.

Alternatives considered:

- Create `bundles-next/` directories. Rejected because it separates files that should stay together during transition.
- Generate HCL only in CI. Rejected because checked-in bundle definitions are easier to review and maintain.

### Decision 2: Use CLI Next for the main CI bundle matrix

Move regular PR and mainline bundle build/deploy jobs to the Next-mode task path wherever the existing workflow is about demo bundle create and deploy. The task path should set `CLI_FEATURES=NextMode=true` for `uds bundle create` and `uds bundle deploy` rather than calling Legacy `uds create` or `uds deploy`. Standard bundle runtime variants, including HA and private PKI, should use CLI Next config files. Registry1 should use the checked-in no-Portal Next bundle definition staged as `bundle.uds.hcl` because registry1 does not include the Portal functional layer.

Rationale: The purpose is to replace current CI workflows with Next mode where possible. Keeping Next as a side workflow would not dogfood the real path.

Alternatives considered:

- Add a separate Next nightly while keeping the main matrix on Legacy. Rejected because it preserves the current path as the primary path.
- Convert every workflow in one step, including release-only Legacy coverage. Rejected because Legacy release artifacts still need confidence until they stop being published.

### Decision 3: Remove separate values CI after CLI Next bundles cover values

Move the configuration currently exercised by `test:uds-core-values-e2e` into the CLI Next bundle definition and its deploy-time config. The Next bundle should use Zarf values for package customization, then run the same validation/e2e checks already used by the main UDS Core test path. Once that is in place, remove the `test_type: values` matrix entry and the dedicated values-only task from regular CI.

Rationale: CLI Next bundles use Zarf values directly, so a separate direct-package values equivalency workflow duplicates coverage after the main bundle workflow moves to Next.

Alternatives considered:

- Keep the values workflow indefinitely. Rejected because it duplicates what the Next bundle deploy should prove.
- Remove values coverage without moving it into the Next bundle. Rejected because UDS Core still needs confidence that values-based customization works.

### Decision 4: Keep Legacy coverage only for release PRs and release workflows

After the main matrix switches to CLI Next, keep Legacy bundle deployment coverage in the CLI compatibility matrix while Legacy artifacts are still published. Release publishing must still build and publish Legacy demo bundles and must also build and publish Next demo bundles.

Rationale: Legacy artifacts still ship, so UDS Core needs compatibility coverage for them. The CLI compatibility matrix is the right place for that coverage because regular CI and publish validation should exercise the Next path.

Alternatives considered:

- Drop Legacy tests immediately. Rejected because Legacy bundles remain published.
- Keep full Legacy coverage on every PR or publish job. Rejected because it undercuts the main CI cutover to CLI Next and increases CI cost.

### Decision 5: Publish Next demo bundles with `-next` names from the same bundle folders

Set the Next bundle metadata and publish target so the k3d standard demo bundle publishes as `k3d-core-demo-next` while the Legacy bundle continues publishing as `k3d-core-demo`. Apply the same pattern to any other demo bundles converted in this change.

Rationale: Distinct names let consumers and CI choose the Next artifact explicitly without replacing existing Legacy references. Keeping files in the same folder avoids a separate maintenance tree.

Alternatives considered:

- Use tag suffixes only, such as `:1.2.3-next`. Rejected by user direction in favor of a `-next` name.
- Publish to a separate repository path only. Rejected because the desired distinction is the bundle name.

### Decision 6: Record the transition in an ADR

Add a UDS Core ADR under `adrs/` that records the implementation decision: main bundle CI moves to CLI Next, Legacy bundle coverage remains for release PRs and releases, Next demo bundles publish with `-next` names, and the separate values-only CI workflow is removed after Next bundles cover values behavior.

Rationale: This changes CI strategy, published artifact shape, and transition policy. Future maintainers need the rationale in the repo, not only in the OpenSpec change.

Alternatives considered:

- Leave the rationale in the PR only. Rejected because the decision affects long-lived release and CI behavior.

### Decision 7: Limit gap tracking to replacement blockers

If a current UDS Core bundle create, deploy, or publish path cannot be moved to CLI Next, record the gap with enough reproduction detail for the CLI team. Do not add unrelated inspect, remove, resume, or signing-specific checks unless the current UDS Core workflow requires them or they block build, deploy, or publish.

Rationale: The plan is about swapping current workflows to Next mode, not expanding UDS Core into a CLI command conformance suite.

Alternatives considered:

- Implement the original Linear issue checklist literally. Rejected because it adds command coverage unrelated to the current UDS Core workflows.

## Risks / Trade-offs

- Next HCL bundle definitions drift from Legacy YAML definitions while both are published → Keep files colocated and add either a lightweight sync check or explicit review checklist for package membership, versions, and deploy config.
- Values coverage is lost while removing `test:uds-core-values-e2e` → Move the existing `test/values/k3d-standard/values.yaml` intent into the CLI Next bundle config before deleting the separate values matrix entry.
- Registry1 cannot use the same standard functional-layer Next bundle while Portal is excluded → Keep a reviewed `bundle-no-portal.uds.hcl` source file and copy it into the build staging directory as `bundle.uds.hcl` for registry1 bundle creation.
- Older CLI compatibility workflows intentionally install CLIs that do not support Next mode → Keep those compatibility checks on Legacy.
- CLI Next cannot represent one of the current bundle behaviors yet → File a CLI Next gap and keep that specific workflow on Legacy until the blocker is resolved.
- Release workflows become confusing because they publish both Legacy and Next artifacts → Use explicit task names and artifact names with `-next`; log both published references.
- Main CI failures increase during the switch → Start by converting the existing main bundle matrix path, keep release-only Legacy coverage, and use workflow dispatch for debugging.
- Consumers accidentally use Next artifacts expecting Legacy behavior → Publish under distinct `-next` names and do not overwrite Legacy tags or names.

## Migration Plan

1. Update the shared setup path to install a `uds` version with Next mode and log the mode used by bundle tasks.
2. Add `bundle.uds.hcl` and any required Next config files in sibling `*-next` demo bundle directories, starting with the current k3d standard demo bundle.
3. Move the existing Zarf values test intent into the CLI Next bundle values/config path.
4. Add Next-mode create, deploy, and publish tasks that map to the existing UDS Core bundle task names or are clearly paired with them.
5. Switch the main CI bundle matrix to call the Next-mode create/deploy tasks.
6. Remove the separate values-only matrix entry/task from regular PR CI after the Next bundle path covers it.
7. Keep Legacy deployment coverage in the CLI compatibility matrix while Legacy demo bundles are still published.
8. Update release publishing to publish Legacy demo bundles as today and Next demo bundles with `-next` names from the sibling Next bundle directories.
9. Add an ADR under `adrs/` for the CLI Next bundle workflow transition.
10. File CLI Next gaps for any current UDS Core build, deploy, or publish behavior that cannot be moved.
11. Verify main CI uses Next mode and release workflows still publish both artifact families.

Rollback is to point the main CI matrix back to the Legacy bundle tasks while leaving the Next bundle files and publish tasks in place for follow-up fixes.
