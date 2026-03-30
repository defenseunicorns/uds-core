# Tasks for UDS Core

This directory contains a number of [UDS task files](https://docs.defenseunicorns.com/cli/how-to-guides/use-uds-runner/) that are used both for CI and local dev to support testing and publishing workflows.

## `create.yaml`

Create tasks are used to create the core packages and bundles. See all available tasks and descriptions with `uds run -f tasks/create.yaml --list`.

## `deploy.yaml`

Deploy tasks are user to deploy the core packages and bundles. See all available tasks and descriptions with `uds run -f tasks/deploy.yaml --list`.

## `iac.yaml`

IAC tasks are primarily used for nightly/weekly CI deployments to cloud provider infrastructure. See all available tasks and descriptions with `uds run -f tasks/iac.yaml --list`.

## `lint.yaml`

Linting tasks provide basic lint checks and fixes for spelling, formatting, and licensing headers. Some of these tasks are also used for pre-commit checks. See all available tasks and descriptions with `uds run -f tasks/lint.yaml --list`.

## `publish.yaml`

Publish tasks are used in CI to publish the core packages to the OCI registry. See all available tasks and descriptions with `uds run -f tasks/publish.yaml --list`.

## `setup.yaml`

Setup tasks provide developers and CI with basic Kubernetes clusters using [`uds-k3d`](https://github.com/defenseunicorns/uds-k3d) as well as the zarf init package. See all available tasks and descriptions with `uds run -f tasks/setup.yaml --list`.

## `test.yaml`

Test tasks run validations and end-to-end testing as well as some full create/deploy/test tasks. See all available tasks and descriptions with `uds run -f tasks/test.yaml --list`.

## `utils.yaml`

Utility tasks provide various utilities to support publishing and testing primarily. See all available tasks and descriptions with `uds run -f tasks/utils.yaml --list`.
