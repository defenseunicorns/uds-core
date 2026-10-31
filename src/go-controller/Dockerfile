# Copyright 2026 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
# Build the static binary with the pinned host SDK first. The prepared build
# context contains only this Dockerfile and the verified binary.
ARG DISTROLESS_IMAGE=gcr.io/distroless/static-debian13@sha256:e2e927ec666bae08560abb3c55d0659eceabb657f56b6782ab500a9fc7f555e3
FROM ${DISTROLESS_IMAGE}
ARG SOURCE_SHA256
ARG BINARY_SHA256
LABEL org.opencontainers.image.source=https://github.com/defenseunicorns/uds-core \
      dev.uds.native.source-sha256=${SOURCE_SHA256} \
      dev.uds.native.binary-sha256=${BINARY_SHA256}
COPY --chmod=0755 uds-controller /usr/local/bin/uds-controller
USER 65532:65532
ENTRYPOINT ["/usr/local/bin/uds-controller"]
