---
title: Requirements

sidebar:
  order: 1
draft: true
---

This document describes the standards for UDS Package Requirements. This is not a _guide_ on how to create a UDS Package, but instead a list of requirements for a UDS Package to be properly and confidently integrated and operated in production environments.

:::note
This document follows [RFC-2119](https://datatracker.ietf.org/doc/html/rfc2119) for definitions of requirement levels (e.g. MUST, SHOULD and MAY).
:::

:::note
For a `Markdown` version of this that is easy to copy, see here.
:::

## Requirements for UDS Package Integrators

### UDS Operator Integration

- [ ] **MUST** be declaratively defined as a [Zarf package](https://docs.zarf.dev/ref/create/).
- [ ] **MUST** integrate declaratively (i.e. no clickops) with the UDS Operator.
- [ ] **MUST** be capable of operating within an airgap (internet-disconnected) environment.
- [ ] **MUST** not use local commands outside of `coreutils` or `./zarf` self references within `zarf actions`.
- [ ] **SHOULD** limit the use of Zarf variable templates and prioritize configuring packages via Helm value overrides.
  > This ensures that the package is configured the same way that the bundle would be and avoids any side effect issues of Zarf's `###` templating.

### Security, Policy, and Hardening

- [ ] **MUST** minimize the scope and number of exemptions, to only what is absolutely required by the application. UDS Packages **MAY** make use of the [UDS Exemption custom resource](https://uds.defenseunicorns.com/reference/configuration/uds-operator/exemption/) for exempting any Pepr policies, but in doing so they **MUST** document rationale for the exemptions. Exemptions should be documented in `docs/justifications.md` of the UDS Package repository.
- [ ] **MUST** declaratively implement any available application hardening guidelines by default.
- [ ] **SHOULD** consider security options during implementation to provide the most secure default possible (i.e. SAML w/SCIM vs OIDC).

### Packaging Lifecycle and Configuration

- [ ] **MUST** (except if the application provides no application metrics) implement monitors for each application metrics endpoint using its built-in chart monitors, `monitor` key, or manual monitors in the config chart. [Monitor Resource](https://uds.defenseunicorns.com/reference/configuration/observability/monitoring-metrics/)
- [ ] **MUST** be versioned using the UDS Package [Versioning scheme](https://github.com/defenseunicorns/uds-common/blob/main/docs/uds-packages/requirements/uds-package-requirements.md#versioning).
- [ ] **MUST** contain documentation under a `docs` folder at the root that describes how to configure the package and outlines package dependencies.
- [ ] **MUST** include application [metadata for UDS Registry](https://github.com/defenseunicorns/uds-common/blob/main/docs/uds-packages/guidelines/metadata-guidelines.md) publishing.
- [ ] **SHOULD** expose all configuration (`uds.dev` CRs, additional `Secrets`/`ConfigMaps`, etc) through a Helm chart (ideally in a `chart` or `charts` directory).
  > This allows UDS bundles to override configuration with Helm overrides and enables downstream teams to fully control their bundle configurations.
- [ ] **SHOULD** implement or allow for multiple flavors (ideally with common definitions in a common directory).
  > This allows for different images or configurations to be delivered consistently to customers.

### Networking and Service Mesh

- [ ] **MUST** define network policies under the `allow` key as required in the [UDS Package Custom Resource](https://uds.defenseunicorns.com/reference/configuration/uds-operator/package/#example-uds-package-cr). These policies **MUST** adhere to the principle of least privilege, permitting only strictly necessary traffic.
- [ ] **MUST** define any external interfaces under the `expose` key in the [UDS Package Custom Resource](https://uds.defenseunicorns.com/reference/configuration/uds-operator/package/#example-uds-package-cr).
- [ ] **MUST** not rely on exposed interfaces (e.g., `.uds.dev`) being accessible from the deployment environment (bastion or pipeline).
- [ ] **MUST** deploy and operate successfully with Istio enabled.
- [ ] **SHOULD** use Istio Ambient unless specific technical constraints require otherwise.
- [ ] **MAY** use Istio Sidecars, when Istio Ambient is not technically feasible. Must document the specific technical constraints in `docs/justifications.md` if using Sidecars.
- [ ] **SHOULD** avoid workarounds with Istio such as disabling strict mTLS peer authentication.
- [ ] **MAY** template network policy keys to provide flexibility for delivery customers to configure.

### Identity and Access Management

- [ ] **MUST** use and create a Keycloak client through the `sso` key for any UDS Package providing an end User Login. [SSO Resource](https://uds.defenseunicorns.com/tutorials/create-uds-package/#integrate-with-single-sign-on)
- [ ] **SHOULD** name the Keycloak client `<App> Login` (i.e. `Mattermost Login`) to provide login UX consistency.
- [ ] **SHOULD** clearly mark the Keycloak client id with the group and app name `uds-<group>-<application>` (i.e. `uds-swf-mattermost`) to provide consistency in the Keycloak UI.
- [ ] **MAY** end any generated Keycloak client secrets with `sso` to easily locate them when querying the cluster.
- [ ] **MAY** template Keycloak fields to provide flexibility for delivery customers to configure.

### Testing

- [ ] **MUST** implement Journey testing, covering the basic user flows and features of the application. (see [Testing Guidelines](https://github.com/defenseunicorns/uds-common/blob/main/docs/uds-packages/guidelines/testing-guidelines.md))
- [ ] **MUST** implement Upgrade Testing to ensure that the current development package works when deployed over the previously released one. (see [Testing Guidelines](https://github.com/defenseunicorns/uds-common/blob/main/docs/uds-packages/guidelines/testing-guidelines.md))

### Recommended Practices for UDS Package Maintainers

These practices are mandatory for Defense Unicorn engineers. For external maintainers, they are strongly recommended to promote consistency, quality, and security.

- [ ] **MUST** be actively maintained by the package maintainers identified in CODEOWNERS [see #CODEOWNERS section for more information](https://github.com/defenseunicorns/uds-common/blob/main/docs/uds-packages/requirements/uds-package-requirements.md#codeowners)
- [ ] **MUST** have a dependency management bot (such as renovate) configured to open PRs to update the core package and support dependencies.
- [ ] **MUST** publish the package to the standard package registry, using a namespace and name that clearly identifies the application (e.g., ghcr.io/uds-packages/neuvector).
- [ ] **SHOULD** be created from the [UDS Package Template](https://github.com/uds-packages/template).
- [ ] **SHOULD** lint their configurations with appropriate tooling, such as [`yamllint`](https://github.com/adrienverge/yamllint) and [`zarf dev lint`](https://docs.zarf.dev/commands/zarf_dev_lint/).
