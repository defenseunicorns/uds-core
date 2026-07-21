# Welcome to UDS VM

Thank you for your interest in contributing to this Defense Unicorns UDS capability.

This document covers the baseline process and requirements for contributing to `uds-vm`.

## Developer experience

Continuous Delivery is core to our development philosophy. Reference [minimumcd.org](https://minimumcd.org) for the baseline agreement on what that means.

Specifically:

* We do trunk-based development on `main` with short-lived feature branches.
* We do not merge code into `main` that is not releasable.
* We run automated testing on all changes before merge.
* Continuous integration (CI) pipeline results are definitive.
* We create immutable release artifacts.

## Definition of done

These requirements apply to all changes in this repository.

* CI passes.
* Tests are updated when behavior changes.
* Documentation is updated when workflows or package behavior changes.
* Changes are peer reviewed.

## Getting started

Use the repo tasks as the source of truth for local workflows.

* `uds run -f tasks.yaml build`
* `uds run -f tasks.yaml deploy`
* `uds run -f tasks.yaml deploy-k3d`
* `uds run -f tasks.yaml test-k3d`
* `uds run -f tasks.yaml vm-test`
* `uds run -f tasks.yaml podinfo-vm-test`
* `npm run typecheck`
* `npm test` (requires an active cluster)

`uds run -f tasks.yaml test-k3d` is the closest match to CI. It deploys the latest released `uds-core` baseline on k3d, layers the local `uds-vm` package on top, and then runs the cluster-backed assertions.

## Submitting a pull request

1. Create an issue first for significant changes.
2. Make your changes in a short-lived branch.
3. Run the relevant local validation before opening the PR.
4. Open a pull request against `main`.
5. Make sure the PR passes CI and includes docs or test changes where needed.

## PR requirements

* PRs must target `main`.
* PR titles must follow conventional commit formatting.
* PRs must pass CI.
* Commits must be signed.

## Contact

Open a GitHub issue for questions about the package or contribution flow.
