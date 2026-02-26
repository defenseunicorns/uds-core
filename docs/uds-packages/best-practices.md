---
title: Best Practices

draft: true
---

<!-- Remove from UDS Common once the docs go live: https://github.com/defenseunicorns/uds-common/blob/main/docs/uds-packages/guidelines/testing-guidelines.md-->
## Testing Practices for UDS Packages
This section outlines testing best practices for UDS Packages. These practices are intended to improve consistency, reliability, and quality across packages.

### Journey Testing
Journey testing validates that a UDS Package deploys correctly in its target environment and continues to integrate with UDS Core services.

#### Definition
A **Journey** is the minimal set of end-to-end checks that validate the critical workflows that can be impacted by our packaging, configuration, or deployment.

#### Key Principles
- Validate the deployment and UDS integration. Avoid duplicating upstream application unit/feature tests.
- Ensure packaging and deployment does not break key functionality.
- Test integration with relevant UDS Core components (e.g., Istio, Keycloak).

#### Implementation Guidelines

- Keep tests small and focused.
- Prioritize deployment-related issues (e.g., network policies, SSO access, cluster resource access).
- If licensing or other constraints prevent a flow from running in CI, document the limitation and implement the most realistic validation available.

#### Tools
- UI Testing: `Playwright`
- API / Non-UI Testing: `Jest`
- Custom Scripts: `Bash or other scripting languages as needed`

### Upgrade Testing
Upgrade tests validate that the current development package can be deployed over the most recently released version.

#### Key Considerations
- Test data migration and persistence.
- Verify that configurations are properly carried over or updated.
- Check for breaking changes in APIs or external integrations.

### Linting and Static Analysis
Use appropriate tooling to ensure code quality and consistency.

#### **Recommended Tools**
- [Zarf Package Linting](https://docs.zarf.dev/commands/zarf_dev_lint/): `zarf dev lint`
- [YAML Linting](https://github.com/adrienverge/yamllint): `yamllint`
- [Shellcheck](https://www.shellcheck.net/) for bash scripts.

:::tip
By utilizing [uds-common](https://github.com/defenseunicorns/uds-common/blob/main/tasks/lint.yaml), many of the above linting commands can be executed by running `uds run lint:yaml|shell`.
:::

### **Best Practices**
1. **Consistency**: Prefer shared patterns across packages where practical.
2. **Documentation**: Document what each test validates and why it exists.
3. **Maintenance**: Update tests as deployment methods evolve, while removing obsolete checks.
4. **CI/CD integration**: Automate the execution of all tests in the CI/CD pipeline so every code change is verified before advancing through the workflow.
5. **Error Handling**: Fail with actionable messages and include enough context to debug.
6. **Repeatability**: Ensure tests produce consistent results regardless of how many times or in what order they are executed. Design them to handle dynamic and asynchronous workloads without compromising output integrity.
7. **Performance Consideration**: Balance coverage with rapid feedback.

### Consistency Across Packages

These examples serve to codify the "Consistency" best practice. By following similar patterns across different UDS packages, we ensure a uniform approach to testing, making it easier for developers to understand and maintain tests across the ecosystem.

