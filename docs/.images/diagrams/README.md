# UDS Core Diagrams

## draw.io Diagrams

The majority of the diagrams in this folder are created with [draw.io](https://app.diagrams.net/). Any SVG files under this folder can be imported into draw.io for further editing/customization.

Current draw.io diagrams include:

1. Architecture Overview with two diagrams that display the following:
    1. `Overview`, basic view of what applications are present and what other services/applications they are communicating with ([diagram](./uds-core-arch-overview.svg)).
    1. `Traffic Direction`, similar to `Overview` layer with the addition of directional arrows to represent the flow of traffic in cluster ([diagram](./uds-core-arch-ingress-egress.svg)).
1. UDS Package custom resource processing flow ([diagram](./uds-core-operator-uds-package.svg))
1. UDS Exemption custom resource processing flow ([diagram](./uds-core-operator-uds-exemption.svg))
1. Keycloak/Authservice specific processing flow for Package custom resource ([diagram](./uds-core-operator-authservice-keycloak.svg))
1. Layered Diagram for Operator, covering Watch/Validate behavior ([draw.io file](./uds-core-operator-overview.drawio)):
    1. Full operator
    1. Custom Resources, Package/Exemption ([diagram](./uds-core-operator-overview.svg))
    1. EndpointSlices
    1. Node (Create/Update and Delete)
    1. Kubernetes Service (API)

Note: the other operator diagram layers are not exported as SVG files in this repository, but are available for reference in the source draw.io file.

## D2 Diagrams

We also have some diagrams that are written as code with [D2](https://d2lang.com/). These diagrams can be edited by [installing the D2 CLI](https://d2lang.com/tour/install) and running the uds task `uds run update-diagrams` after making changes to the D2 source files.

Current D2 diagrams include:
1. Package resource tree

#### If you have suggestions for the diagrams, we welcome issues or pull requests contributions to [uds-core](https://github.com/defenseunicorns/uds-core).
