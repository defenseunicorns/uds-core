## Why

UDS Core should dogfood UDS CLI Next in the workflows it already relies on instead of adding side-path command coverage. Switching the main bundle CI path to Next mode will validate the real build, deploy, and publish flows while Legacy remains available for release confidence during transition.

## What Changes

- Add Next-mode bundle definitions for the existing demo bundles in their current bundle folders, using functional layer packages with explicit dependencies for the standard demo bundle.
- Change the main UDS Core CI bundle build and deploy matrix to use UDS CLI Next where bundle workflows are currently exercised.
- Move current Zarf values deploy coverage into the CLI Next bundle path because CLI Next bundles use Zarf values.
- Remove the separate Zarf values equivalency workflow once the CLI Next bundle path covers that behavior.
- Publish Next-mode demo bundle artifacts alongside the existing Legacy demo bundle artifacts.
- Keep Legacy demo bundle publishing and testing for release PRs and release workflows only.
- Name the Next-mode demo bundle artifacts with `-next`, such as `k3d-core-demo-next`, and keep Next bundle sources in sibling `*-next` bundle directories.
- Capture UDS CLI Next gaps only when the current UDS Core workflow cannot be replaced with Next mode.
- Record the CI, publishing, Legacy transition, and Zarf values consolidation decisions in a UDS Core ADR.

## Capabilities

### New Capabilities
- `ci-cli-next-bundles`: UDS Core builds, deploys, and publishes demo bundles through UDS CLI Next as the main CI bundle path while retaining Legacy release coverage during transition.

### Modified Capabilities
- None.

## Impact

- UDS Core bundle definitions under `bundles/`.
- CI workflows that build, deploy, test, publish demo bundles, and currently run separate Zarf values equivalency coverage.
- Maru tasks that wrap bundle create, deploy, publish, and values-based deploy behavior.
- Release PR and release workflows that retain Legacy bundle validation and publishing.
- Published bundle names and OCI references for Next-mode demo bundles.
- UDS Core architecture decision records under `adrs/`.
