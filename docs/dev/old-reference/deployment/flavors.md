---
title: Published Flavors
---

UDS Core is published with multiple variations (Zarf flavors). Each flavor uses a separate source registry for the images. Each flavor is used as the suffix on the OCI tags for packages. For production use cases we recommend the `registry1` or `unicorn` flavors as these images tend to be more secure than their `upstream` counterparts.

:::note
Demo and dev bundles (`k3d-core-demo` and `k3d-core-slim-dev`) are only published from the upstream flavor.
:::

### Flavors

| Flavor                | GHCR Location                                  | Image Source                                                                                                         |
| --------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `registry1`           | `ghcr.io/defenseunicorns/packages/uds`         | [Ironbank](https://p1.dso.mil/services/iron-bank) - DoD hardened images                                              |
| `upstream`            | `ghcr.io/defenseunicorns/packages/uds`         | Various sources, typically DockerHub/GHCR/Quay, these are the default images used by helm charts                     |
| `unicorn`             | `ghcr.io/defenseunicorns/packages/private/uds` | Industry best images designed with security and minimalism in mind                                                   |

:::note
The `unicorn` flavored packages are only available in a private repository. These packages are available for all members of the Defense Unicorns organization/company, if you are outside the organization [contact us](https://www.defenseunicorns.com/contactus) if you are interested in using this flavor for your mission.
:::
