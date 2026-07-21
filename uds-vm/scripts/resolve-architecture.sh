#!/usr/bin/env bash

set -euo pipefail

ARCHITECTURE="${1:-$(uname -m)}"

case "${ARCHITECTURE}" in
  x86_64)
    ARCHITECTURE="amd64"
    ;;
  aarch64|arm64)
    ARCHITECTURE="arm64"
    ;;
esac

printf '%s\n' "${ARCHITECTURE}"
