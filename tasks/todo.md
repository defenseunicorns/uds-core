# CORE-689 fresh implementation

- [x] Verify the current branch and preserve untracked user files.
- [x] Read repository rules, `plan.md`, investigation evidence, and the reference commit.
- [x] Verify the stopped/restored resources, order, replica counts, and prior CI results.
- [x] Create a fresh branch from `origin/main`.
- [x] Apply the minimal checkpoint ordering change.
- [x] Run relevant local checks.
- [x] Review the final diff and PR template.
- [x] Commit, push, and create a draft pull request.
- [x] Report files, checks, CI status, and blockers.

# PR #2944 review comments

- [x] Run the review-comment preflight with the user-approved pending-check override.
- [x] Fetch unresolved review threads and build shared PR context.
- [x] Analyze one thread per subagent.
- [x] Aggregate and synthesize the review report.
- [x] Present the report for approval.
- [ ] Implement approved high-value fixes and replies.
- [ ] Push, resolve threads, and verify CI.

# CORE-675 implementation

1. [ ] Revalidate `origin/main`, the working tree, the two exact K3s releases, and both multi-architecture custom images.
2. [ ] Add the exact-version/flavor matrix file.
3. [ ] Add the Renovate same-minor rule and validate dependency extraction/update behavior.
4. [ ] Add the minimal optional K3s input through the reusable worker and existing values test path.
5. [ ] Add the separate nightly/release/manual orchestration workflow with explicit permissions and inherited secrets.
6. [ ] Add one task-level server-version assertion, aggregate status, distinct logs, and one scheduled alert.
7. [ ] Update tested-version documentation and consistency lint.
8. [ ] Run local syntax, formatting, Renovate, matrix-input, and task checks.
9. [ ] Run the implementation PR matrix through its self-change trigger.
10. [ ] Run one manual cell and one manual subset.
11. [ ] Record the first natural nightly and release-please runs as post-merge evidence.
12. [ ] Review the final diff and report files, checks, and the remaining third-minor coverage gap.
