# UDS Core Diagrams

## draw.io Diagrams

The majority of the diagrams in this folder are created with [draw.io](https://app.diagrams.net/). Any SVG files under this folder can be imported into draw.io for further editing/customization.

Current draw.io diagrams include:

1. Architecture Overview with two diagrams that display the following:
  1. `Overview`, basic view of what applications are present and what other services/applications they are communicating with.
  1. `Traffic Direction`, similar to `Overview` layer with the addition of directional arrows to represent the flow of traffic in cluster.
1. Operator Overview with four diagrams that display the following:
  1. Overview of custom resource flow
  1. Package custom resource processing flow
  1. Exemption custom resource processing flow
  1. Keycloak/Authservice specific processing flow for Package custom resource

## D2 Diagrams

We also have some diagrams that are written as code with [D2](https://d2lang.com/). These diagrams can be edited by [installing the D2 CLI](https://d2lang.com/tour/install) and running the uds task `uds run update-diagrams` after making changes to the D2 source files.

Current D2 diagrams include:
1. Package resource tree

#### If you have suggestions for the diagrams, we welcome issues or pull requests contributions to [uds-core](https://github.com/defenseunicorns/uds-core).
