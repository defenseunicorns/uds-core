# Welcome to UDS Core

Thank you for your interest in contributing to Defense Unicorns UDS Core! This document will guide you through the contribution process.

## Table of Contents

1. [Developer Experience](#developer-experience)
2. [Definition of Done](#definition-of-done)
3. [Getting Started](#getting-started)
4. [Submitting a Pull Request](#submitting-a-pull-request)
   - [Note for External Contributors](#note-for-external-contributors)
5. [PR Requirements](#pr-requirements)
6. [Contact](#contact)

## Developer Experience

Continuous Delivery is core to our development philosophy. Check out [https://minimumcd.org](https://minimumcd.org) for a good baseline agreement on what that means.

Specifically:

- We practice trunk-based development (main) with short-lived feature branches that are merged and deleted after the merge.
- We don't merge code into main that isn't releasable.
- All changes are tested automatically before being merged into main.
- Continuous integration (CI) pipeline tests are the source of truth.
- We produce immutable release artifacts.

### Pre-Commit Checks

We use [codespell](https://github.com/codespell-project/codespell) and [yamllint](https://yamllint.readthedocs.io/en/stable/) for pre-commit checks. Please install these before committing, or your commit may fail.

To install these tools, run:

```console
# Setup husky pre-commit dependency
npx husky

# Install codespell and yamllint
uds run lint-check
```

Alternatively, you can install them with `pip`:

```console
pip install yamllint codespell
```

Additionally, we add and check for license headers in our files. The pre-commit check is performed by this [UDS Common task](https://github.com/defenseunicorns/uds-common/blob/main/tasks/lint.yaml#L159-L225).

This task requires that `GO` and `addlicense` dependencies are installed. Install `GO` by following the [official documentation](https://go.dev/doc/install). To install `addlicense` and it's required dependencies you can run the following command:
```console
uds run -f tasks/lint.yaml fix-license
```

> [!NOTE]
> If you choose to forgo pre-commit checking there is a possibility that the commit will fail Github pipeline jobs that perform these checks.

## Definition of Done

We apply these principles to all User Stories and contributions:

- Automated continuous integration (CI) pipeline tests pass
- CI tests are updated to cover new system changes
- Changes are peer-reviewed
- Acceptance criteria is met
- Documentation is updated to reflect changes

### Testing

Each individual component of UDS Core contains lightweight validations in its own `src/<component>/tasks.yaml` file. These validations focus on the bare minimum functionality, typically covering pod health and endpoint accessibility.

We also place end-to-end tests under the `e2e` folder. In particular we use [Playwright](https://playwright.dev/) for browser based testing and have authentication setup to login to applications with a shared SSO session. Playwright provides a [test recorder](https://playwright.dev/docs/codegen#generate-tests-with-the-playwright-inspector) which can be beneficial to get a quickstart on new tests.

In general our testing focuses on the unique configuration and setup provided by UDS Core, rather than exhaustive functionality testing. We take this approach since each of the opensource applications we package and configure also have extensive end-to-end testing in their upstream repositories.

## Getting Started

This section will help you get set up and ready to contribute to UDS Core.

### 1. Prerequisites

Before starting, ensure that you have the following installed:

- **Git**: [Install Git](https://git-scm.com/book/en/v2/Getting-Started-Installing-Git)
- **K3d**: [Install K3d](https://k3d.io/#installation)
- **Node.js** (for building and running Pepr): [Install Node.js](https://nodejs.org/en/download/) (we recommend Node 24 to align with what CI tests/builds with)
- **UDS CLI** (for running tasks and deploying): [Install UDS](https://uds.defenseunicorns.com/cli/quickstart-and-usage/)
- **Go** (for development and testing): [Install Go](https://go.dev/doc/install)

### 2. Clone the Repository and Make a Branch

Clone the UDS Core repository to your local machine using Git (note that you may want to [fork](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/working-with-forks/fork-a-repo) this repository):

```console
git clone https://github.com/DefenseUnicorns/uds-core.git
cd uds-core
```

Then make a branch for your changes:

```console
git checkout -b my-feature-branch
```

### 3. Make Changes and Test Locally

Make the changes to add the new feature, bug fix, or other change necessary. Keep in mind any documentation or testing changes that are relevant while making code changes.

When you are ready to test locally you can run the same tests as CI using the below UDS commands:

```console
# Lightweight validations
uds run test-uds-core

# Full e2e tests (run in CI)
uds run test:uds-core-e2e
```

Each of these tasks will create a local k3d cluster, install UDS Core, and run a series of tests against it, the same tests that are run in CI.

If you want to run a subset of core for faster iterations against a specific package, you can use the `LAYER` variable with the below task (example for metrics-server):

```console
uds run test-single-layer --set LAYER=metrics-server
```

Note you can also specify the `--set FLAVOR=<registry1/unicorn>` flag to test using with either the Iron Bank or Unicorn sourced images instead of the upstream ones.

## Submitting a Pull Request

1. **Create an Issue**: For significant changes, please create an issue first, describing the problem or feature proposal. Trivial fixes do not require an issue.
2. **Branch vs. Fork**: We prefer contributors to work on branches within the main repository when possible, as this allows full CI/CD processes to run without encountering issues with restricted secrets. If you do not have permissions, you may use a fork, but be aware of potential CI/CD limitations.
3. **Commit Your Changes**: Make your changes and commit them. **All commits must be signed**.
4. **Run Tests**: Ensure that your changes pass all tests.
5. **Push Your Branch**: Push your branch to the main repository or your fork on GitHub.
6. **Create a Pull Request**: Open a pull request against the `main` branch of the Bundle repository. Please make sure that your PR passes all CI checks.

### Note for External Contributors

When submitting a pull request (PR) from a forked repository, please note that our CI/CD processes may not run completely due to security restrictions. This is because certain secrets required for the full CI/CD pipeline are not accessible from forks. 

**What to expect:**
1. **CI/CD Failures**: If you notice CI/CD failures, it might be due to these limitations rather than issues with your code.
2. **Maintainer Review**: Our maintainers will review your PR and, if necessary, check out your branch and push it to the main repository. This step allows the full CI/CD process to run with the required secrets, ensuring that all checks are performed.

### PR Requirements

* PRs must be against the `main` branch.
* PRs must pass CI checks.
* All commits must be signed.
* PRs should have a related issue, except for trivial fixes.

## Contact

For any questions or concerns, please open an issue on GitHub or contact the maintainers.
