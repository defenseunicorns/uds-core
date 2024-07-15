---
title: Flavor Specific Development Notes
type: docs
weight: 5
---

Specific flavors of UDS Core have access and architecture restrictions when used for development work. The `upstream` flavor is generally recommended for development as it does not have any restrictions or requirements.

### Registry1

The `registry1` flavor uses images from [Ironbank](https://p1.dso.mil/services/iron-bank) which can only be pulled with authentication. Developers can self-register on [P1 SSO](https://login.dso.mil/) and retrieve a pull token for auth from [registry1's Harbor](https://registry1.dso.mil/). (In upper right corner, click --> User Profile, then click the Copy icon next to CLI secret, and use this for `docker login`.)

Images in `registry1` historically only supported `amd64` architectures. While some images do now support `arm64` architecture, uds-core only supports `amd64` for the `registry1` flavor. If developing on an `arm64` machine you will need to use a virtualization layer or an external dev box.

### Unicorn

The `unicorn` flavor uses images primarily from a private Chainguard repository. These images can be pulled by any developers in the Defense Unicorns organization once added to the Chainguard repository. Local authentication should be done with [chainctl](https://edu.chainguard.dev/chainguard/administration/how-to-install-chainctl/), specifically using the [credential helper](https://edu.chainguard.dev/chainguard/administration/how-to-install-chainctl/#configure-a-docker-credential-helper) for a seamless experience.

Developers outside of the Defense Unicorns organization/company will be unable to pull these images directly and should rely on CI testing for validation of this flavor. [Contact us](https://www.defenseunicorns.com/contactus) if you have a need to pull these images and develop on this flavor in particular.
