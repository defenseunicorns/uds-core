---
title: Flavor Specific Development Notes
description: This document describes various flavors of UDS Core.
---

Specific flavors of UDS Core have access and architecture restrictions when used for development work. The `upstream` flavor is generally recommended for development as it does not have any restrictions or requirements.

### Registry1

The `registry1` flavor uses images from [Ironbank](https://p1.dso.mil/services/iron-bank) which can only be pulled with authentication. Developers can self-register on [P1 SSO](https://login.dso.mil/) and retrieve a pull token for auth from [registry1's Harbor](https://registry1.dso.mil/). (In upper right corner, click --> User Profile, then click the Copy icon next to CLI secret, and use this for `docker login`.)

Images in `registry1` historically only supported `amd64` architectures. While some images do now support `arm64` architecture, uds-core only supports `amd64` for the `registry1` flavor. If developing on an `arm64` machine you will need to use a virtualization layer or an external dev box.

### Unicorn


The `unicorn` flavor uses images primarily from a private repository. These images can be pulled by any developer in the Defense Unicorns organization.

Developers outside the Defense Unicorns organization/company will be unable to pull these images directly and should rely on CI testing for validation of this flavor. [Contact us](https://www.defenseunicorns.com/contactus) if you have a need to pull these images and develop on this flavor in particular.
