# Renovate Readiness Scripts

This directory contains TypeScript scripts used to automate the renovate PR readiness checks.

## Overview

These scripts are used by the renovate-readiness GitHub Action to determine if a Renovate PR is ready for testing. They check for image and chart updates and apply appropriate labels to the PR based on the results.

## Scripts

### getImagesAndCharts.ts

Extracts images and charts from zarf.yaml files in a given directory path.

**Usage:**
```bash
# From within the scripts/renovate directory
npx ts-node getImagesAndCharts.ts <directory-path>
```

This script will:
1. Recursively find all zarf.yaml files in the specified directory
2. Extract Helm charts and container images from these files
3. Write the extracted data to YAML files in an 'extract' subdirectory

### compareImagesAndCharts.ts

Compares images and charts between two extract folders (outputs of getImagesAndCharts.ts).

**Usage:**
```bash
# From within the scripts/renovate directory
npx ts-node compareImagesAndCharts.ts <old-extract-path> <new-extract-path>
```

This script will:
1. Compare chart versions between old and new, detecting major updates
2. Compare image versions between old and new, detecting major updates
3. Identify if the PR is waiting on Ironbank or Chainguard image updates
4. Output a list of changes and labels to apply to the PR

## Labels

The scripts can apply the following labels to PRs:

- `waiting on ironbank`: If a registry1 image is behind
- `waiting on cgr`: If a chainguard image is behind
- `helm-chart-only`: If a PR only contains a helm chart update
- `needs-review`: If PR is NOT waiting on image updates
- `major-helm-update`: If the PR contains a major chart version bump
- `major-image-update`: If the PR contains a major image version bump

## Testing

Run the tests with:

```bash
# From within the scripts/renovate directory
cd scripts/renovate
npx jest
```

The tests cover various scenarios including:
- Images with suffixes
- Images without a match in other flavors
- Helm chart only updates
- Major helm/image updates
