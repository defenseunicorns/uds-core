# CI testing

UDS Core has several types of CI testing that run on PRs, releases, and schedules. This document introduces the primary pipelines and the coverage they provide.

## Pipeline types

UDS Core runs pipelines for different validation goals. These pipelines vary by trigger, target cluster, and Core configuration.

- When: Tests run on all PRs, conditionally on PRs, or on a schedule.
- Where: Tests run on k3d, Kubernetes distributions, and sometimes cloud providers.
- What: Tests validate different UDS Core configurations.

All tests run before release on the release-please PR to validate Core before publishing. Since GitHub Actions opens release PRs, pipelines do not run automatically. Add a milestone to the release PR to start them.

On PRs opened by [Renovate](https://github.com/renovatebot/renovate), pipelines run after the renovate-readiness action/scripts determine the PR is ready and all images have aligned versions. You can also start CI manually by adding the `renovate-ready` label to the PR.

### Full Core install

This test validates an install of the `k3d-core-demo-next` bundle with UDS CLI Next. The demo bundle includes all functional layers and components in Core, so this test provides full application coverage.

When: On all PRs

Where: k3d

What: [Standard k3d Next bundle](../../bundles/k3d-standard-next/bundle.uds.hcl), all standard components enabled

### Full Core upgrade

This test deploys the latest release of the Legacy `k3d-core-demo` bundle, then upgrades to the `k3d-core-demo-next` bundle built from the PR branch with UDS CLI Next. This catches breaking changes across both UDS Core and the CLI Next functional-layer deployment path.

When: On all PRs

Where: k3d

What: Latest published [standard k3d Legacy bundle](../../bundles/k3d-standard/uds-bundle.yaml) upgraded to the PR branch [standard k3d Next bundle](../../bundles/k3d-standard-next/bundle.uds.hcl)

### Single layer

Single layer tests deploy an individual [functional layer](https://docs.defenseunicorns.com/core/concepts/platform/functional-layers/) of Core and any required dependency layers, such as `base` and `identity-authorization`. These tests provide fast feedback on layer-specific issues without waiting for the full Core tests. They also validate that layers work in isolation with only the documented dependencies.

When: Conditionally on PRs

Where: k3d

What: Individual [layer packages](https://github.com/defenseunicorns/uds-core/tree/main/packages)

### CLI matrix

The CLI matrix validates compatibility across UDS CLI versions and deployment modes. It covers Legacy bundle behavior while Legacy artifacts remain published, and it covers CLI Next install and upgrade behavior for the standard demo bundle.

The upgrade matrix currently covers these scenarios:

- **Legacy old-old**: Install the latest release with the minimum supported Legacy CLI, then upgrade to the current branch with the same Legacy CLI.
- **Legacy old-new**: Install the latest release with the minimum supported Legacy CLI, then upgrade to the current branch with the current CLI.
- **Legacy-to-Next**: Install the latest Legacy release with the minimum supported Legacy CLI, then upgrade to the current branch with the minimum supported CLI Next version.

Next-to-Next upgrade coverage is planned after the first Next demo bundle is published.

The install matrix currently covers these scenarios:

- **Legacy install**: Fresh install of the current branch Legacy bundle with the minimum supported Legacy CLI.
- **Next install**: Fresh install of the current branch Next bundle with the minimum supported CLI Next version.

When: Nightly and on PRs that change `bundles/k3d-standard/**` or `bundles/k3d-standard-next/**`

Where: k3d

What: [Standard k3d Legacy bundle](../../bundles/k3d-standard/uds-bundle.yaml) and [standard k3d Next bundle](../../bundles/k3d-standard-next/bundle.uds.hcl), `upstream` flavor

### Production

Production testing mimics production-like setups by deploying Core on several Kubernetes distributions. These tests validate configurations with external cloud dependencies, HA setups, and multi-node clusters.

When: Scheduled (weekly)

Where: AKS, EKS, RKE2 (on AWS)

What: [Infrastructure specific bundles](https://github.com/defenseunicorns/uds-core/tree/main/.github/bundles), configured with external dependencies

## Test types

Core pipelines include two types of testing. They provide faster feedback on some failures and options for local developer testing.

### Smoke tests

UDS Core maintains lightweight smoke tests for each application in the platform. These tests live under the `validate` task name in `src/<pkg>/tasks.yaml`. They typically check pod readiness, pod health, and basic endpoint behavior.

The `validate` tasks also test the UDS Operator and Policies in `src/pepr`. These tests use Jest and live in the individual `*.spec.ts` files. Most tests use mocks, but the full suite requires a live cluster with Pepr webhooks deployed, specifically for the policy tests.

### Functionality tests

UDS Core also maintains functionality tests, including end-to-end tests. These tests live under the `test/` directory, and individual package tests use file names under the subdirectories. UI tests use Playwright, and API or generic tests use Jest.
