# CI Testing

UDS Core has several types of CI testing that run on PRs, releases, and schedules. This document provides an introduction to the types of pipelines and tests that run for UDS Core.

## Pipeline Types

Within UDS Core there are a number of pipelines we run for different types of testing. These primarily vary in two aspects:
- When: Tests are run either on all PRs, conditionally on PRs, or on a schedule
- Where: Tests are run on a variety of cluster types and sometimes cloud providers
- What: Tests may have different configurations of Core to validate

All tests are run before release (on the release-please PR) to ensure we validate Core in all situations before a release. Since release PRs are opened by github-actions, pipelines are not automatically run and must be kicked off by adding a milestone to the PR.

On PRs opened by [Renovate](https://github.com/renovatebot/renovate), pipelines are not run until the `renovate-ready` label is added to the PR. This is primarily done to prevent excessive CI churn before images are up to date.

### "Full Core" Install

This tests validates an install of the `k3d-core-demo` bundle. The demo bundles includes all functional layers and components in Core, so this test provides full coverage of all applications.

When: On all PRs

Where: k3d

What: [Standard k3d bundle](https://github.com/defenseunicorns/uds-core/blob/main/bundles/k3d-standard/uds-bundle.yaml), all `optionalComponents` enabled

### "Full Core" Upgrade

In order to ensure we catch any breaking changes across upgrades we also run an upgrade test of Core. This test deploys the latest release of the `k3d-core-demo` bundle, then upgrades to the version of core built from the PR branch. This test includes all functional layers and components in Core.

When: On all PRs

Where: k3d

What: [Standard k3d bundle](https://github.com/defenseunicorns/uds-core/blob/main/bundles/k3d-standard/uds-bundle.yaml), all `optionalComponents` enabled, upgrade tested from latest release

### "Single Layer"

Single layer tests deploy an individual [functional layer](https://uds.defenseunicorns.com/reference/uds-core/functional-layers/) of core as well as any dependency layers required (i.e. base, identity-authorization). The primary goal of these tests is to provide fast feedback on issues in the layers without needing to wait on the full core tests. They also help to validate that layers work "in isolation" with only the documented dependencies.

When: Conditionally on PRs

Where: k3d

What: Individual [layer packages](https://github.com/defenseunicorns/uds-core/tree/main/packages)

### "Production"

Our "production" testing aims to mimic a more production-like setup by running a full deployment of core on a variety of Kubernetes distributions. These tests provide more production-like configurations with external cloud dependencies, HA setups, and multi-node clusters.

When: Scheduled (weekly)

Where: AKS, EKS, RKE2 (on AWS)

What: [Infrastructure specific bundles](https://github.com/defenseunicorns/uds-core/tree/main/.github/bundles), configured with external dependencies

## Test Types

Core Pipelines include two types of testing, separated to provide faster feedback on some failures and options for local developer testing.

### Smoke Tests

UDS Core maintains a suite of extremely lightweight smoke tests for each application in the platform. These tests are all found under the `validate` task name in `src/<pkg>/tasks.yaml`. Typically these will check pod readiness/health as well as basic endpoint validation.

As part of the `validate` tasks we also run testing against our UDS Operator and Policies (`src/pepr`). Tests here are run with Jest and can be found in the individual `*.spec.ts` files in the code. Most of this testing is unit testing with mocks as necessary, but the full suite of testing does require a live cluster with Pepr's webhooks deployed (specifically for the policy tests).

### Functionality Tests

UDS Core also maintains a suite of functionality tests (often end-to-end type tests). These tests are found under the `test/` directory, and individual package tests can be found by file name under the sub-folders. Playwright is used as the framework for UI based testing and Jest is used for API or other generic testing.
