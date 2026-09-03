## 1. Baseline and CLI Version

- [ ] 1.1 Run the current main CI-equivalent bundle build/deploy path with Legacy mode to confirm the starting workflow is healthy.
- [ ] 1.2 Update or verify the shared setup installs a `uds` version that includes CLI Next mode.
- [ ] 1.3 Add logging for bundle jobs that prints the selected `uds` version and whether `CLI_FEATURES=NextMode=true` is set.

## 2. Next Bundle Definitions

- [ ] 2.1 Add `bundle.uds.hcl` in a sibling Next directory for the existing k3d standard demo bundle.
- [ ] 2.2 Model the standard Next bundle with functional layer packages and explicit `depends_on` edges.
- [ ] 2.3 Set the Next k3d standard demo bundle metadata name to `k3d-core-demo-next`.
- [ ] 2.4 Add any required Next-mode defaults, values, and runtime config files beside the current bundle files, including HA and private PKI standard-bundle configs where feasible.
- [ ] 2.5 Move the configuration intent from `test/values/k3d-standard/values.yaml` into the CLI Next bundle values/config path.
- [ ] 2.6 Verify the Next bundle definition represents the same demo bundle intent as the Legacy k3d standard bundle and covers the current values deploy behavior.
- [ ] 2.7 Repeat the Next bundle definition work for any other demo bundles that remain part of current CI bundle workflows.

## 3. Bundle Tasks

- [ ] 3.1 Add or update create tasks so the main CI bundle path uses `CLI_FEATURES=NextMode=true uds bundle create`.
- [ ] 3.2 Add or update deploy tasks so the main CI bundle path uses `CLI_FEATURES=NextMode=true uds bundle deploy`.
- [ ] 3.3 Add or update publish tasks so Next demo bundle artifacts are pushed with `CLI_FEATURES=NextMode=true uds bundle push`.
- [ ] 3.4 Keep Legacy create, deploy, and publish tasks available for release PR and release workflows.
- [ ] 3.5 Add a lightweight drift check or documented review checklist for Legacy YAML and Next HCL bundle definitions while both are maintained.

## 4. CI Workflow Changes

- [ ] 4.1 Switch the main CI matrix jobs that build and deploy demo bundles to the Next-mode task path, including HA and private PKI standard-bundle jobs where the Next bundle can represent the package set.
- [ ] 4.2 Remove regular PR dependence on the full Legacy demo bundle build/deploy path after the Next path is active.
- [ ] 4.3 Remove the `test_type: values` matrix entry and separate values-only workflow path after CLI Next bundle deploy covers values behavior.
- [ ] 4.4 Keep Legacy demo bundle validation in the CLI compatibility matrix while Legacy artifacts are still published.
- [ ] 4.5 Ensure release workflows continue to publish Legacy demo bundles.
- [ ] 4.6 Ensure release workflows validate and publish Next demo bundles with `-next` artifact names.

## 5. Decision Record and Gap Tracking

- [ ] 5.1 Add a UDS Core ADR under `adrs/` for the CLI Next bundle workflow transition.
- [ ] 5.2 In the ADR, record main CI moving to CLI Next, release-only Legacy coverage, Next demo bundle `-next` publishing, and values workflow consolidation.
- [ ] 5.3 Run the Next-mode main CI-equivalent bundle path locally or in CI.
- [ ] 5.4 For each build, deploy, or publish blocker, file a CLI Next follow-up with the workflow, command, bundle, CLI version, and failure output.
- [ ] 5.5 Keep any blocked workflow on Legacy only when there is a linked CLI Next blocker.

## 6. Verification

- [ ] 6.1 Run formatting or lint checks for changed workflows, tasks, bundle files, and the ADR.
- [ ] 6.2 Verify the main CI path builds and deploys demo bundles with CLI Next.
- [ ] 6.3 Verify the CLI Next bundle deployment covers the Zarf values behavior previously covered by `test:uds-core-values-e2e`.
- [ ] 6.4 Verify the CLI compatibility matrix still builds and deploys the Legacy demo bundle path.
- [ ] 6.5 Verify release publishing validates Next bundles and produces both Legacy demo bundle artifacts and Next `-next` demo bundle artifacts.
- [ ] 6.6 Run `openspec validate switch-ci-bundle-workflows-to-cli-next --strict` and resolve any validation issues.
