# ADR: UDS Core Functional Layers

Date: 2024-07-17

## Status

Accepted

## Context

Historically, UDS Core intentionally only published a single official Zarf Package to ensure a standard baseline across all UDS environments. We learned from the complex buffet menu-style of Big Bang that it is better to form opinions and test them than to allow unlimited configuration possibilities. We have also found the monorepo structure of UDS Core to be be much simpler for developing UDS Core. However, through user feedback, we have seen cases where more optionality is warranted, but having to modify UDS CLI to accommodate disabling portions of UDS Core is not ideal. We also have a need for an edge-compatible version of UDS Core that is more lightweight and does not include all the components of the full UDS Core package.

Today, we publish just the official UDS Core package, in addition to dev and demo UDS Bundles. The UDS Slim Dev bundle contains k3d and a stripped-down version of UDS Core that includes limited services meant for testing UDS Packages. We have also learned that some teams outside of UDS need similar functionality, but slightly different parts of UDS Core, such as Keycloak + Authservice.

## Decision

We will provide the existing single package as well as a layered set of packages within the existing monorepo. This will allow users to choose the components they need for their specific use case, while maintaining a single source of truth for all UDS Core components. We will not break these out by applications as Big Bang did, but instead by layers of functionality for related/integrated components. This allows more flexibility for which functionality is provided by UDS Core and which is provided by other external packages.

The functional layers will be:

1. UDS Core Base (Istio + Pepr w/UDS Operator & UDS Policies)
2. UDS Core Identity and Authorization (Keycloak + AuthService)
3. UDS Core Metrics (Metrics Server)
4. UDS Core Monitoring (Prometheus + Grafana)
5. UDS Core Logging (Promtail + Loki)
6. UDS Core Runtime Security (NeuVector)
7. UDS Core Backup and Restore (Velero)
8. UDS Core (combination of all layers)

These layers can be combined as needed, with UDS Core Base serving as the foundation for all deployments. The UDS Core package will continue to offer the complete suite of tools. End users should default to using the full Core package unless there is an explicit need for a subset of tooling. The only change in the UDS Core repo will be the addition of new package definitions for each functional layer. Versioning will be managed at the monorepo level, with each layer being versioned in lockstep with the rest of UDS Core. Initially there will be documented dependencies (i.e. UDS Core Base is required for everything, UDS Core Identity and Authorization would be required for layers that have end user logins, etc) - which could later be implemented in code in CLI to validate bundle construction and ordering.

We will still publish the UDS Slim Dev bundle for testing UDS Packages. This will be a combination of UDS Core Base, UDS Core Identity and Authorization, and UDS-K3d. We will not publish other bundles beyond UDS Slim Dev and UDS Core Demo. Only the UDS Core Zarf package will publish combined layers.

## Consequences

### Positive

- Increased flexibility for users to choose components based on their needs
- Simplified versioning and dependency management by keeping everything in one repo
- Easier coordination of changes across layers
- Maintains a single source of truth for all UDS Core components
- Enables both testing environments and production edge deployments

### Negative

- Need for more comprehensive documentation on layer combinations and usage
- Testing needs to be expanded to cover common layer combinations
- Need to address dependencies and configurations shared across layers
- We will still need to publish the UDS Slim Dev bundle for testing UDS Packages and that might confuse users (UDS Slim Dev bundle will combine UDS-K3d + UDS Core Base + UDS Core Identity and Authorization)
- UDS Package developers may need to document required layers (i.e. "UDS Package GitLab requires UDS Identity and Authorization")

## Implementation Details

- Each layer will be implemented as a separate Zarf package within the existing monorepo (under `./packages/uds-core-<layer>/zarf.yaml`)
- UDS Core Base will replace the current UDS Slim Dev package
- UDS Operator will be updated to handle excluded layers (i.e. skip monitoring configuration if monitoring layer is not deployed)
- The existing UDS Core package will be maintained, combining all layers
- Documentation will be updated to list required dependencies and ordering for layers. In the future these will be coded into CLI.

## Alternatives Considered

1. Splitting into multiple repositories: Rejected due to added complexity in versioning and coordination
1. Maintaining the current monolithic package structure without layers: Rejected due to lack of flexibility for users with different needs
1. Creating more granular layers: Considered but decided against to maintain a balance between flexibility and simplicity

## Open Questions

- What build and testing processes need to be adjusted to support the layered approach within the monorepo?
- How will we handle shared dependencies and configurations across layers?

## Next Steps

1. Define detailed specifications for each layer, including their specific capabilities and integration points
1. Create the Zarf packages for each functional layer within the monorepo
1. Update operator code to conditionally execute integrations based on layer existence
1. Implement integration tests for various layer combinations
1. Update documentation to reflect the new layered architecture and guide users in selecting appropriate layers for their needs (including proper ordering and dependencies)
