# Welcome to UDS Core

Thank you for your interest in Defense Unicorns UDS Core!

This document describes the process and requirements for contributing to this UDS Core repo.

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

* We do trunk-based development (main) with short-lived feature branches that originate from the trunk, get merged into the trunk, and are deleted after the merge
* We don't merge code into main that isn't releasable
* We perform automated testing on all changes before they get merged to main
* Continuous integration (CI) pipeline tests are definitive
* We create immutable release artifacts

Commits:

We use [codespell](https://github.com/codespell-project/codespell) and [yamllint](https://yamllint.readthedocs.io/en/stable/) for our precommit checking. It is recommended to have these installed before attempting to commit to the a branch otherwise your commit will not finalize and you will be shown an error.

To install both of these tools you can run `uds run lint-check` to install them or utilize `pip` to install them manually.

```bash
pip install yamllint codespell
```

## Definition of Done

We apply these general principles to all User Stories and activities contributing to the UDS.

* Automated continuous integration (CI) pipeline tests pass
* CI pipeline tests have been updated to meet system changes
* Changes are peer reviewed
* Acceptance criteria is met
* Documentation is updated to reflect what changed

## Getting Started

TBD

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
