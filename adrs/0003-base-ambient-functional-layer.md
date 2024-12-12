# 3. Base Ambient Functional Layer

Date: 2024-12-12

## Status

Accepted

Amends [ADR: UDS Core Functional Layers](0002-uds-core-functional-layers.md)

## Context

Multiple Mission Heroes have expressed a desire to deploy UDS Core with Istio in Ambient mode instead of Sidecar Injection mode. This would significantly reduce the resource requirements for UDS Core deployments and enable deploying UDS Core in environments where Sidecar Injection would cause resource constraints. Now that Istio Ambient mode is [GA in Istio v1.24](https://istio.io/latest/blog/2024/ambient-reaches-ga/) we should support this mode in UDS Core.

## Decision

We will produce a new functional layer for UDS Core that includes Istio in Ambient mode. This layer will be called UDS Core Base Ambient. The existing UDS Core Base will continue to include Istio in Sidecar Injection mode. The UDS Core Base Ambient layer will be a drop-in replacement for UDS Core Base, with the only difference being the Istio configuration.
We will also update the UDS Operator to support deploying UDS Core with Istio in Ambient mode. The same operator will be used for both UDS Core Base and UDS Core Base Ambient deployments.
We will update the rest of the UDS Core components to support being deployed on top of either UDS Core Base or UDS Core Base Ambient. This change should have no effect on the components themselves, as they should be able to run on top of either Istio configuration.
We will publish the UDS Core Base Ambient Zarf package in addition to the existing UDS Core Base package.
We will publish the UDS Core Standard Ambient bundle in addition to the existing UDS Core Standard bundle. The UDS Core Standard Ambient bundle will include UDS Core Base Ambient instead of UDS Core Base.

## Consequences

### Positive

- UDS Core can be deployed in environments where Sidecar Injection would cause resource constraints
- UDS Core functional layers can be combined with either Istio configuration
- Simplified configuration of Istio for Base layer
- Able to deliver UDS Core features without requiring a switch to Ambient mode
- Does not impact FIPS compliance of UDS Core Base when deployed with Sidecar Injection

### Negative

- Must maintain two versions of UDS Core Base
- Must ensure that all UDS Core components can run on top of either Istio configuration
- Increases complexity of UDS Operator to support both Istio configurations

## Implementation Details

- UDS Core Base Ambient will be implemented as a separate Zarf package
- UDS Operator will be updated to determine Istio mode and deploy the appropriate configuration
- UDS Core components will be updated to support both Istio configurations if required
- Testing will be expanded to cover both Istio configurations as well as upgrading existing UDS Core Base to UDS Core Base Ambient
- Documentation will be updated to include information on deploying UDS Core with Istio in Ambient mode

## Alternatives Considered

- Creating a single UDS Core Base package that can be deployed with either Istio configuration. Rejected due to the complexity of maintaining a single package that can be deployed with two different Istio configurations. Also Istio Ambient requires CNI configurations depending on the environment that are not relevant for Sidecar Injection leading to a confusing configuration.
- Migrating UDS Core Base to Ambient mode and deprecating Sidecar Injection mode. Rejected due to the impact on existing deployments and uncertainty around the impact on FIPS compliance. This can be revisited in the future once Istio Ambient has had more time to "bake".

## Open Questions

- Istio Ambient slices L4 and L7 traffic into 2 distinct layers. Should we deploy L7 compatible configuration by default and have an "opt out" for L4 only, or reverse it?
- How will be handle migrating existing UDS Core Base deployments to UDS Core Base Ambient?
- Will we continue to support UDS Core Base deployments with Istio in Sidecar Injection mode long term?

## Next Steps

1. Build and test UDS Core Base Ambient package
1. Update UDS Operator to support deploying UDS Core Base Ambient
1. Update UDS Core components to support both Istio configurations
1. Test UDS Core Base Ambient deployments in various environments
1. Test UDS Core Base to UDS Core Base Ambient upgrades and document issues
1. Update documentation to include information on deploying UDS Core with Istio in Ambient mode
