---
title: Anatomy

draft: true
---
<!-- Before going live, will need to remove this Anatomy Reference: https://uds.defenseunicorns.com/structure/packages/ -->

## Anatomy of a UDS Package Repository

The goal of this document is to cover the main components of a UDS Package and their functions at an overview level.

### Anatomy Overview

| Directory / Top-level file | Role | Function |
| :--- | :------------------------- | :------- |
| `.github/` | CI/CD | Directives to GitHub Actions/Github CI/CD workflows. Primarily contains the build, test, and release pipeline(s). |
| `adr/` | Docs | Architectural Decision Records (ADRs) that capture key architectural decisions. |
| `bundle/` | Testing & Development | Dev/test bundle(s) utilizing [Bundle Overrides](https://uds.defenseunicorns.com/reference/bundles/overrides/#quickstart), in order to deploy the package alongside dependencies (e.g., databases/object storage) to validate configuration and integration. This content is not included in the built UDS Package artifact. |
| `chart/` | UDS Package Component | Helm chart(s) for `uds-config` and supplemental resources. Includes at minimum the [UDS Package Custom Resource](https://uds.defenseunicorns.com/reference/configuration/custom-resources/packages-v1alpha1-cr/) (`uds-package.yaml`), plus any required UDS integration Helm templates. (e.g., [postgres secret](https://github.com/uds-packages/reference-package/blob/main/chart/templates/postgres-secret.yaml), SSO secret, etc..).
| `common/` | UDS Package Component | Base `zarf.yaml` imported by the root-level `zarf.yaml`, used to support multiple [UDS Package Flavors](https://uds.defenseunicorns.com/overview/acronyms-and-terms/#flavor-as-in-uds-package-or-bundle-flavor). Uses the shared [values/common-values.yaml](https://github.com/uds-packages/reference-package/blob/main/values/common-values.yaml), to apply values across all flavors. |
| `docs/` | Docs | Package documentation (configuration, dependencies, usage, etc.). |
| `tasks/` | Testing & Development | Repository-scoped UDS Runner task files that extend the workflows defined in `tasks.yaml` (often for test automation and dependency management). |
| `tests/` | Testing & Development | Integration-level tests verifying the application is properly integrated with UDS Core and declared dependencies. |
| `values/` | UDS Package Component | Helm values files for the upstream chart, typically `common-values.yaml`, plus a `<flavor>-values.yaml` per flavor. |
| `tasks.yaml` | Testing & Development | Entrypoint for UDS Runner workflows (`uds run <task>`), such as deploy/test/dev flows. Composes local tasks plus shared tasks from [UDS Common](https://github.com/defenseunicorns/uds-common/blob/main/tasks.yaml). |
| `zarf.yaml` | UDS Package Component | Primary Zarf package definition for the UDS Package. Defines package metadata, top-level Zarf variables, and declares components for each required flavor. Each component imports shared definitions from `common/zarf.yaml`, references the Helm chart and values for that flavor and defines the required container images to be pulled. |
