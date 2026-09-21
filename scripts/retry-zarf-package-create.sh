#!/usr/bin/env bash
# Copyright 2024-2026 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

set -euo pipefail

if [ "$#" -lt 4 ]; then
  echo "Usage: $0 <package-path> <architecture> <flavor> <zarf-config> [create-options...]" >&2
  exit 2
fi

PACKAGE_PATH="$1"
ARCHITECTURE="$2"
FLAVOR="$3"
CONFIG="$4"
shift 4

readonly MAX_ATTEMPTS=2
readonly RETRY_DELAY_SECONDS=15
readonly TRANSIENT_REGISTRY_ERROR_PATTERN='https?://[^" ]+/v2/[^" ]*".*(i/o timeout|TLS handshake timeout|connection reset by peer|connection refused|unexpected EOF|no such host|network is unreachable)'

attempt=1
while [ "${attempt}" -le "${MAX_ATTEMPTS}" ]; do
  log_file=$(mktemp)
  echo "Creating ${PACKAGE_PATH} (attempt ${attempt}/${MAX_ATTEMPTS})"

  if ZARF_CONFIG="${CONFIG}" ./zarf package create "${PACKAGE_PATH}" \
    --confirm \
    --architecture="${ARCHITECTURE}" \
    --flavor "${FLAVOR}" \
    --features values=true \
    "$@" 2>&1 | tee "${log_file}"; then
    rm -f "${log_file}"
    exit 0
  fi

  if ! grep -Eiq "${TRANSIENT_REGISTRY_ERROR_PATTERN}" "${log_file}"; then
    echo "Package creation failed with a non-retryable error." >&2
    rm -f "${log_file}"
    exit 1
  fi

  if [ "${attempt}" -eq "${MAX_ATTEMPTS}" ]; then
    echo "Package creation failed after ${MAX_ATTEMPTS} attempts." >&2
    rm -f "${log_file}"
    exit 1
  fi

  echo "Package creation hit a transient registry error; retrying in ${RETRY_DELAY_SECONDS}s." >&2
  rm -f "${log_file}"
  sleep "${RETRY_DELAY_SECONDS}"
  attempt=$((attempt + 1))
done
