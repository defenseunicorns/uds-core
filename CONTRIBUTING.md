# Welcome to UDS Core

Thank you for your interest in contributing to Defense Unicorns UDS Core! This document will guide you through the process of contributing code, documentation, or ideas. We welcome improvements and fixes from anyone and our goal is to ensure you have all the information you need to contribute effectively and in alignment with the project’s requirements.

## How You Can Contribute

We appreciate contributions in several forms:
- **Report Issues or Bugs**: If you encounter a problem, feel free to open a [GitHub issue](https://github.com/defenseunicorns/uds-core/issues/new?template=bug_report.md). Include details on your environment, how to reproduce the bug, and any relevant logs or screenshots. This helps us improve UDS Core’s stability.
- **Suggest Enhancements**: Have an idea for a new feature or an improvement? You can [open an issue](https://github.com/defenseunicorns/uds-core/issues/new?template=feature_request.md) to propose it. For significant feature ideas, please start with an issue only to gather feedback before spending time on code. This ensures the idea aligns with our project goals and roadmap, which is primarily driven by internal needs (we’ll evaluate suggestions for alignment).
- **Submit Code Changes (Pull Requests)**: You can contribute fixes, minor enhancements, or even new features via pull requests (PRs). We especially welcome contributions that fix bugs or improve performance/stability. If you plan to work on something, it’s a good idea to open an issue first to ensure you are aligned with the maintainers.
- **Improve Documentation**: Contributions to documentation (e.g. tutorials, configuration reference, even code comments) are valuable. If you find areas of the docs that can be clearer, you can submit changes. Please follow existing documentation structure and style where possible (ask if you're unsure).

Please note that large-scale changes or new features might not be immediately incorporated if they don’t fit with our current focus. We’ll do our best to communicate politely and provide guidance on such contributions (e.g. suggesting a smaller scope or alternative approaches) – our intent is not to discourage ideas, but to keep the project stable and aligned with its vision.

## Development Workflow

### Development Philosophy

Continuous Delivery is core to our development philosophy. Check out [https://minimumcd.org](https://minimumcd.org) for a good baseline on what that means.

Specifically:

- We practice trunk-based development (main) with short-lived feature branches that are merged and deleted after the merge.
- We don't merge code into main that isn't releasable.
- All changes are tested automatically before being merged into main.
- Continuous integration (CI) pipeline tests are the source of truth.
- We produce immutable release artifacts.

### Development Environment Setup

#### Prerequisites

Before starting, ensure that you have the following installed:

- **Git**: [Install Git](https://git-scm.com/book/en/v2/Getting-Started-Installing-Git)
- **K3d**: [Install K3d](https://k3d.io/#installation)
- **Node.js** (for building and running Pepr): [Install Node.js](https://nodejs.org/en/download/) (we recommend Node 24 to align with what CI tests/builds with)
- **UDS CLI** (for running tasks and deploying): [Install UDS](https://uds.defenseunicorns.com/cli/quickstart-and-usage/)
- **Go** (for pre-commit tooling): [Install Go](https://go.dev/doc/install)
- **Helm** (for development and testing): [Install Helm](https://helm.sh/docs/intro/install/)
- **Helm Unittest Plugin** (for development and testing): [Install Helm unittest](https://github.com/helm-unittest/helm-unittest?tab=readme-ov-file#install)

#### Setting Up Your Local Repository

Clone the UDS Core repository to your local machine using Git (if you don't have access to the `defenseunicorns` org you will want to [fork](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/working-with-forks/fork-a-repo) this repository):

```console
git clone https://github.com/defenseunicorns/uds-core.git
cd uds-core
```

Then make a branch for your changes:

```console
git checkout -b my-feature-branch
```

#### Pre-Commit / Lint Checks

We use pre-commit hooks to ensure code quality and consistency. These checks run automatically when you commit code and help catch issues early.

**Setup Pre-Commit with Husky:**

```console
# Initialize husky hooks (only needed once after cloning)
npx husky
```

**Required Tools:**

Our pre-commit and linting checks validate:

1. **YAML formatting** using [yamllint](https://yamllint.readthedocs.io/)
1. **Spelling** using [codespell](https://github.com/codespell-project/codespell)
1. **License headers** using [addlicense](https://github.com/google/addlicense)
1. **TypeScript formatting** using [Pepr](https://github.com/defenseunicorns/pepr)'s formatter (eslint)
1. **Helm charts** using [helm-unittest](https://github.com/helm-unittest/helm-unittest)

The easiest way to install all required dependencies is:

```console
# Install the helm-unittest plugin
helm plugin install https://github.com/helm-unittest/helm-unittest.git
# Run the lint-check which installs other dependencies
uds run lint-check
```

> [!TIP]
> If your commit fails due to linting issues, you can generally fix them automatically with `uds run lint-fix` or `uds run -f tasks/lint.yaml fix-license` (for missing license headers).

### Testing Your Changes

#### Local Testing

Make the changes to add the new feature, bug fix, or other change necessary. Keep in mind any documentation or testing changes that are relevant while making code changes.

When you are ready to test locally you can run the same tests as CI using the below UDS commands:

```console
# Lightweight validations + Unit Tests
uds run test-uds-core

# Unit Tests Only
uds run test:unit-tests

# Full e2e tests (run in CI)
uds run test:uds-core-e2e
```

Each of these tasks will create a local k3d cluster, install UDS Core, and run a series of tests against it, the same tests that are run in CI.

If you want to run a subset of core for faster iterations against a specific package, you can use the `LAYER` variable with the below task (example for metrics-server):

```console
uds run test-single-layer --set LAYER=metrics-server
```

Note you can also specify the `--set FLAVOR=<registry1/unicorn>` flag to test using with either the Iron Bank or Unicorn sourced images instead of the upstream ones.

Depending on the scope and focus of your changes you may find other specific types of testing valuable. You can review available tasks to assist with local testing in [`tasks.yaml`](./tasks.yaml) and the `tasks/` folder. If you are unsure of the best way to test a given change, feel free to ask in the issue that you are working.

#### Testing Strategy

Each individual component of UDS Core contains lightweight validations in its own `src/<component>/tasks.yaml` file. These validations focus on the bare minimum functionality, typically covering pod health and endpoint accessibility.

Unit test files are placed next to the source code they are testing. These tests should be designed to run without dependencies like a running cluster or mocking higher level functions, for example we want to avoid mocking pepr functions where possible.

We also place end-to-end tests under the `e2e` folder. In particular we use [Playwright](https://playwright.dev/) for browser based testing and have authentication setup to login to applications with a shared SSO session. We also use [Vitest](https://vitest.dev/) for some lower level API and Kubernetes based testing.

In general our testing focuses on the unique configuration and setup provided by UDS Core, rather than exhaustive functionality testing. We take this approach since each of the opensource applications we package and configure also have extensive end-to-end testing in their upstream repositories.

### Definition of Done

We apply these principles to all User Stories and contributions:

- Automated continuous integration (CI) pipeline tests pass
- CI tests are updated to cover new system changes
- Changes are peer-reviewed
- Acceptance criteria is met
- Documentation is updated to reflect changes

## Pull Request Process

### Before Creating a Pull Request

1. **Create an Issue**: For significant changes, please create an issue first, describing the problem or feature proposal. Trivial fixes do not require an issue.
1. **Ensure All Tests Pass**: Run the full core install/test as described in the [local testing section](#local-testing) to verify your changes work as expected.
1. **Sign Your Commits**: All commits must be signed. [Learn about signing commits](https://docs.github.com/en/authentication/managing-commit-signature-verification/signing-commits).

### Submitting a Pull Request

When opening a pull request make sure to follow the below guidelines to ensure there aren't delays in reviews of your contribution:
- Ensure that the title of the PR follows [conventional commit](https://www.conventionalcommits.org/en/v1.0.0/) syntax. Typically PRs will fall into the categories of `fix:` (bug fixes), `feat:` (new features), `chore:` (dependency/other updates), or `docs:` (documentation changes).
- Update the PR description adding a summary of changes, linking related issues, and noting the type of change. If appropriate, also make sure to fill out the "Steps to Validate" section noting how you tested your change, as well as any test coverage you added.
- Ensure all CI checks pass, and make any necessary changes if they do not. See the note below if you are an external contributor (changes from a fork outside of the `defenseunicorns` GitHub organization).
- In general do not force-push updates to your PR branch. This will make it harder for reviewers to see what has changed since their last review. Also note that we do not strictly require branches to be up to date with `main`, so only rebase your branch as necessary/when making other changes.

> [!NOTE]
> When submitting a pull request (PR) from a forked repository, please note that our CI/CD processes may not run completely due to security restrictions. This is because certain secrets required for the full CI/CD pipeline are not accessible from forks.
>
> If you notice CI/CD failures, it might be due to these limitations rather than issues with your code. Our maintainers will review your PR and, if necessary, check out your branch and push it to the main repository. This step allows the full CI/CD process to run with the required secrets, ensuring that all checks are performed.

## Additional Notes

**Roadmap and Vision**: The high-level roadmap of UDS Core is primarily driven by Defense Unicorns’ internal planning and needs. This means we may not be able to incorporate every feature suggestion, especially if it diverges from our core mission. However, we do value external feedback - even if a proposed change isn’t merged, your ideas could inspire future solutions. We aim to communicate our reasons respectfully if we decline a contribution. You can also check the GitHub issues to see what kinds of improvements and features are slated for upcoming releases.

**License Notice**: UDS Core is dual licensed under the GNU Affero General Public License v3.0 (AGPL-3.0) and the Defense Unicorns Commercial License (see [LICENSING.md](./LICENSING.md) for details). By contributing to this project, you agree that your contributions will be released under the same license. If you’re not comfortable with that (for example, if your employer has restrictions), please consult the necessary parties before submitting code. We do not require a separate Contributor License Agreement (CLA) at this time; contributions are accepted under this license via the act of contributing.

**Support and Contact**: If you have questions about the contribution process or need guidance on something, you can open a GitHub issue. Because we’re not running a dedicated community forum or chat for UDS Core, the best way to get help is through the repository’s issue tracker. We’ll do our best to respond in a reasonable time. Remember that maintainers are likely juggling multiple responsibilities, so please be patient.
