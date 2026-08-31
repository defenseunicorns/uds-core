## Purpose

Defines UDS Core's transition of existing demo bundle CI workflows to UDS CLI Next while preserving Legacy bundle release coverage and publishing Next demo artifacts alongside Legacy artifacts.

## ADDED Requirements

### Requirement: Main CI uses CLI Next for bundle workflows
UDS Core SHALL use UDS CLI Next for the main CI workflows that build and deploy demo bundles where those workflows currently exercise bundle create and deploy behavior. The standard CLI Next demo bundle SHALL use UDS Core functional layer packages with explicit dependency ordering rather than the monolithic standard package. Standard-bundle runtime variants, including HA and private PKI, SHALL use CLI Next config files. Registry1 standard-bundle workflows SHALL use a no-Portal Next bundle definition.

#### Scenario: Main CI bundle build uses CLI Next
- **WHEN** the main UDS Core CI matrix builds a demo bundle
- **THEN** the bundle is built through UDS CLI Next rather than the Legacy bundle create path

#### Scenario: Main CI bundle deploy uses CLI Next
- **WHEN** the main UDS Core CI matrix deploys a demo bundle
- **THEN** the bundle is deployed through UDS CLI Next rather than the Legacy bundle deploy path

### Requirement: CLI Next bundles cover Zarf values usage
UDS Core SHALL use CLI Next bundle definitions to exercise Zarf values configuration that was previously covered by the separate values deploy equivalency workflow.

#### Scenario: CLI Next bundle uses Zarf values
- **WHEN** the main UDS Core CI matrix deploys the CLI Next demo bundle
- **THEN** the deployment applies the Zarf values configuration needed for UDS Core package customization coverage

#### Scenario: Separate values workflow is removed
- **WHEN** CLI Next bundle deployment covers the values-based package configuration path
- **THEN** UDS Core no longer runs a separate values-only equivalency workflow in regular PR CI

### Requirement: Next demo bundles are published with distinct names
UDS Core SHALL publish CLI Next demo bundle artifacts alongside Legacy demo bundle artifacts using distinct `-next` bundle names while keeping their source bundle files in the existing bundle directories.

#### Scenario: Next demo bundle publish name is distinct
- **WHEN** UDS Core publishes demo bundles through CLI Next
- **THEN** the published bundle names include `-next`, such as `k3d-core-demo-next` and `k3d-core-slim-dev-next`

#### Scenario: Legacy demo bundle publish remains available
- **WHEN** UDS Core publishes release demo bundle artifacts during transition
- **THEN** the existing Legacy bundle artifact names remain published in addition to the CLI Next `-next` artifacts

### Requirement: Legacy coverage is limited to compatibility checks and publishing
UDS Core SHALL retain Legacy bundle publishing for release workflows and Legacy deployment testing in the CLI compatibility matrix while the regular main CI and publish validation paths use CLI Next where possible.

#### Scenario: CLI compatibility matrix keeps Legacy validation
- **WHEN** UDS Core validates older supported CLI behavior
- **THEN** the CLI compatibility matrix validates the Legacy demo bundle path while Legacy artifacts remain published

#### Scenario: Release workflow keeps Legacy publishing
- **WHEN** a release workflow publishes demo bundles
- **THEN** UDS Core publishes both the Legacy demo bundle artifacts and the CLI Next `-next` demo bundle artifacts

#### Scenario: Registry1 uses a no-Portal Next bundle
- **WHEN** a registry1 standard-bundle workflow creates a CLI Next bundle
- **THEN** UDS Core stages the checked-in no-Portal bundle definition as `bundle.uds.hcl` and excludes Portal validation

#### Scenario: Older CLI compatibility keeps Legacy validation
- **WHEN** a workflow intentionally installs an older CLI that does not support Next mode
- **THEN** UDS Core keeps that compatibility check on the Legacy bundle path

### Requirement: Implementation decision is recorded
UDS Core SHALL record the CLI Next bundle workflow implementation decision in an ADR.

#### Scenario: ADR captures transition strategy
- **WHEN** the CLI Next bundle workflow change is implemented
- **THEN** an ADR records the main CI cutover to CLI Next, release-only Legacy coverage, `-next` demo bundle publishing, and removal of separate values-only CI coverage

### Requirement: CLI Next gaps are tracked only for current workflow replacement blockers
UDS Core SHALL track UDS CLI Next follow-up gaps when a current UDS Core bundle workflow cannot be replaced with CLI Next.

#### Scenario: Current workflow cannot move to CLI Next
- **WHEN** a current UDS Core bundle build, deploy, or publish workflow cannot run with CLI Next
- **THEN** the gap is recorded with the affected workflow, command, bundle, CLI version, and observed failure

#### Scenario: Extra command coverage is not required
- **WHEN** a CLI Next command is not part of the current UDS Core bundle build, deploy, or publish workflow
- **THEN** UDS Core does not add CI coverage for that command solely for dogfooding
