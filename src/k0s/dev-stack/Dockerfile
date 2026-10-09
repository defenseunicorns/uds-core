# Copyright 2026 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

# K0S_TAG has no default; callers must pass --build-arg K0S_TAG=<version>.
ARG K0S_TAG
# Digest-pinned for reproducible builds; managed by Renovate's Docker manager.
ARG WOLFI_IMAGE="cgr.dev/chainguard/wolfi-base:latest@sha256:1d95114038f76513a9ace6fca107d5582b08c65981f81f61cb56bf7fd2ef216d"

FROM ${WOLFI_IMAGE} AS wolfi
FROM k0sproject/k0s:${K0S_TAG}

# Glob picks up the arch-specific ELF interpreter (ld-linux-x86-64.so.2 or ld-linux-aarch64.so.1).
COPY --from=wolfi /usr/lib/ld-linux-*.so* /usr/lib/
# libdl.so.2 and libpthread.so.0 are compat stubs since glibc 2.34; included for
# binaries that still link against them explicitly.
COPY --from=wolfi \
    /usr/lib/libc.so.6 \
    /usr/lib/libdl.so.2 \
    /usr/lib/libpthread.so.0 \
    /usr/lib/

# libcrypto.so.3 is not a static ELF dependency; Go's opensslcrypto backend dlopen's it at runtime.
COPY --from=wolfi /usr/lib/libcrypto.so.3 /usr/lib/

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

RUN /usr/lib/ld-linux-*.so* --version 2>&1 | grep -qi "glibc" || \
    (echo "ERROR: glibc ELF interpreter not functional" >&2 && exit 1)
RUN test -f /usr/lib/libcrypto.so.3 || \
    (echo "ERROR: libcrypto.so.3 not found" >&2 && exit 1)
