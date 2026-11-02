# Copyright 2026 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
# CI supplies the flavor's resolved Chainguard base digest and verified binary.
ARG BASE_IMAGE
FROM ${BASE_IMAGE}
ARG SOURCE_SHA256
ARG BINARY_SHA256
ARG FLAVOR
LABEL org.opencontainers.image.source=https://github.com/defenseunicorns/uds-core \
      dev.uds.native.source-sha256=${SOURCE_SHA256} \
      dev.uds.native.binary-sha256=${BINARY_SHA256} \
      dev.uds.native.flavor=${FLAVOR}
COPY --chmod=0755 uds-controller /usr/local/bin/uds-controller
USER 65532:65532
ENTRYPOINT ["/usr/local/bin/uds-controller"]
