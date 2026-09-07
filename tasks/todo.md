- [x] Reproduce the OpenAPI validation failure on the local Unicorn cluster.
- [x] Identify the unavailable API service and the owning configuration.
- [x] Implement the smallest root-cause fix with a Luna agent.
- [x] Run focused local checks.
- [x] Push the fix to PR #2930.
- [ ] Monitor PR checks until green.

## PR #2924 review comment 3905143978

- [x] Implement deterministic, conflict-isolating startup hydration while retaining accepted-state maps.
- [x] Add sidecar, ambient, ordering, trigger, deletion, transition, list-failure, and mutex regression coverage.
- [x] Update shared-egress conflict documentation for both Istio modes.
- [x] Run focused tests, full unit tests, formatting checks, and review the final diff.
- [x] Draft the GitHub reply without posting it.
- [ ] Commit and push the scoped changes.
- [ ] Post the approved reply and resolve the review thread.
- [ ] Monitor and fix required PR checks until green.

## CORE-689 checkpoint startup failure

- [x] Collect the Linear issue, Slack thread, and attached debug bundle.
- [x] Establish the exact failure sequence from logs and source history.
- [x] Implement the smallest root-cause fix and regression check.
- [x] Run focused and repository-required checks.
- [x] Run brutal review and address high-confidence findings.
- [x] Commit, push, and create a draft PR from the repository template.
- [ ] Monitor and fix required PR checks until green, excluding the known Unicorn flavor failure.

## UDS Core v1.12.0 release notes

- [x] Inspect the release-please PR, release history, and documentation configuration.
- [x] Identify release content, dependency versions, and upgrade requirements.
- [x] Create and validate the release notes and overview updates.
- [x] Create the stacked GitHub pull request targeting #2925.

## UDS Core v1.12.0 dependency audit

- [x] Extract every release-range dependency change from source manifests.
- [x] Verify each release-notes table row and upstream release link.
- [x] Correct the release notes and update PR #2931 if needed.

## PR #2931 rebase and release notes

- [x] Rebase the PR branch onto `origin/main`.
- [x] Remove the Keycloak upgrade from the release notes.
- [x] Add the merged changes identified by PR #2892 to the release notes.
- [x] Verify the PR base and release-notes diff.
- [x] Audit every dependency version and upstream release link in the notes.

## PR #2931 review comments

- [x] Verify PR checks and branch state.
- [x] Analyze every open review thread and create the review report.
- [x] Wait for approval before implementing or posting replies.

## PR #2931 Portal release note

- [x] Inspect the Portal update source and release details.
- [x] Add the Portal update to the release notes.
- [ ] Verify the scoped change and PR checks.

## CORE-689 investigation artifact

- [x] Collect current Linear issue data, comments, and attachments.
- [x] Collect linked Slack discussions and files.
- [x] Collect repository, pull request, commit, and CI evidence.
- [x] Correlate the evidence and write `investigation.md`.
- [x] Verify sources, links, completeness, and the final diff.

## CORE-689 implementation

- [ ] Verify that suspension works for the existing slim-dev workloads.
- [ ] Implement live discovery and the Bash phase classifier.
- [ ] Implement suspension and source recovery.
- [ ] Implement phased restore and readiness barriers.
- [ ] Integrate the Bash helper into the existing Zarf package.
- [ ] Confirm the existing checkpoint workflow covers the implementation.
- [ ] Run local checks and the existing checkpoint task sequence.
- [ ] Update checkpoint documentation and prepare the review diff.
- [ ] Invoke `$brutal-review` on the completed implementation.
- [ ] Address every high-confidence finding and revalidate the changes.
- [ ] Publish the reviewed implementation as a GitHub draft PR.
- [ ] Request GitHub reviews from Greptile, Copilot, and Codex.
- [ ] Address actionable external feedback and verify final CI and review status.
