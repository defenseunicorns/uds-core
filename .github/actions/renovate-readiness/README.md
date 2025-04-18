# Renovate Readiness Action

This GitHub Action automates the process of checking if Renovate PRs are ready for testing.

## Overview

UDS Core uses [Renovate](https://github.com/renovatebot/renovate) to track and automate dependency updates. Due to support for 3 flavors of core (upstream, registry1, and unicorn), most dependency updates are not ready when the PRs are first opened. This action automates the process of checking if a PR is ready for testing.

## How It Works

The action performs the following steps:

1. **Manual Override Check**: If the PR has the `renovate-ready` label, the action will set `should_process` to `false` and skip all other checks, allowing CI to proceed.

2. **Branch Name Processing**: The action extracts the package name from the branch name by removing the `renovate/` prefix.

3. **Special Case Handling**:
   - **Pepr Updates**: For Pepr updates, the action compares the version in `package.json` with the image versions in `tasks/create.yaml`. If they don't match, it adds the `waiting on ironbank` label.
   - **Support Dependencies**: For support dependency updates, the action adds the `needs-review` label and sets `should_process` to `false` to prevent excessive IAC runs.

4. **Regular Package Updates**:
   - The action performs sparse checkouts of the relevant package directory from both the PR branch and the main branch.
   - It extracts images and charts from both branches using the `getImagesAndCharts.ts` script.
   - It compares the extracted data using the `compareImagesAndCharts.ts` script.
   - Based on the comparison, it applies appropriate labels to the PR:
     - `waiting on ironbank`: If a registry1 image is behind
     - `waiting on cgr`: If a chainguard image is behind
     - `helm-chart-only`: If a PR only contains a helm chart update
     - `needs-review`: If PR is NOT waiting on image updates
     - `major-helm-update`: If the PR contains a major chart version bump
     - `major-image-update`: If the PR contains a major image version bump
   - If any `waiting on` labels are applied, the action sets `should_process` to `false` to prevent running CI.

## Usage

The action is automatically triggered for all Renovate PRs in the slim-dev-test.yaml workflow. No manual intervention is required.

### Manual Override

If you want to force a PR to run CI regardless of its readiness status, add the `renovate-ready` label to the PR.

## Implementation Details

- **TypeScript Scripts**: The core logic for extracting and comparing images and charts is implemented in TypeScript scripts located in the `scripts/renovate` directory.
  - `getImagesAndCharts.ts`: Extracts images and charts from zarf.yaml files in a directory.
  - `compareImagesAndCharts.ts`: Compares extracted images and charts between two directories and determines if the PR is ready for testing.
- **GitHub Action**: The GitHub Action orchestrates the process, handling special cases and applying labels based on the script outputs.
- **Workflow Integration**: The action is integrated into the slim-dev-test.yaml workflow, which is triggered for all PRs.
- **Output Variables**:
  - `should_process`: Indicates whether the PR should proceed with CI. Set to `false` if the PR has the `renovate-ready` label or if it's waiting on image updates.
  - `needs_comparison`: Indicates whether the PR needs to run the comparison scripts. Set to `false` for special cases like Pepr updates.

## Testing

The TypeScript scripts are thoroughly tested using Jest:

- **getImagesAndCharts.test.ts**: Tests the extraction of images and charts from zarf.yaml files, including edge cases like:
  - Empty directories
  - Invalid YAML files
  - Missing components
  - Images without version tags

- **compareImagesAndCharts.test.ts**: Tests the comparison of images and charts, including:
  - Helm chart updates (both regular and major)
  - Image updates (including major updates)
  - Waiting conditions for Ironbank and Chainguard images
  - Missing or empty extract files
  - Invalid version formats

## Troubleshooting

If you encounter issues with the action, check the following:

1. **PR Labels**: Check if the PR has any `waiting on` labels, which indicate what the PR is waiting for.
2. **Action Logs**: Check the action logs for any errors or warnings.
3. **Manual Override**: If needed, add the `renovate-ready` label to force the PR to run CI.
4. **Debug Output**: The action outputs detailed information about its decisions, which can help diagnose issues.

## Related Documentation

- [Renovate PR Process](https://www.notion.so/Renovate-PR-Process-182e512f24fc80479d35f956a7c42388?pvs=21)
- [Renovate Documentation](https://docs.renovatebot.com/)
