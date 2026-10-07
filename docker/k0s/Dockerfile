# Copyright 2026 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

ARG K0S_VERSION
ARG WOLFI_IMAGE="cgr.dev/chainguard/wolfi-base:latest@sha256:1d95114038f76513a9ace6fca107d5582b08c65981f81f61cb56bf7fd2ef216d"

FROM ${WOLFI_IMAGE} AS wolfi
FROM k0sproject/k0s:${K0S_VERSION}

COPY --from=wolfi /usr/lib/ld-linux-*.so* /usr/lib/
COPY --from=wolfi \
    /usr/lib/libc.so.6 \
    /usr/lib/libdl.so.2 \
    /usr/lib/libpthread.so.0 \
    /usr/lib/libcrypto.so.3 \
    /usr/lib/

ARG TARGETARCH
RUN case "${TARGETARCH}" in \
    amd64) \
        mkdir -p /lib64 && \
        ln -sf /usr/lib/ld-linux-x86-64.so.2 /lib64/ld-linux-x86-64.so.2 && \
        ln -sf /usr/lib/ld-linux-x86-64.so.2 /lib/ld-linux-x86-64.so.2 \
        ;; \
    arm64) \
        ln -sf /usr/lib/ld-linux-aarch64.so.1 /lib/ld-linux-aarch64.so.1 \
        ;; \
    *) echo "Unsupported architecture: ${TARGETARCH}" >&2 && exit 1 ;; \
    esac

RUN /usr/lib/ld-linux-*.so* --version 2>&1 | grep -qi "glibc"
RUN test -f /usr/lib/libcrypto.so.3
