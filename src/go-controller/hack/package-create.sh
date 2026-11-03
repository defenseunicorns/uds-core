#!/usr/bin/env bash
# Copyright 2026 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
# Published artifacts are the default. Development overrides affect a private
# source copy, never the checkout or an operator's deployment variables.
set -euo pipefail
root=$(cd "$(dirname "$0")/../../.." && pwd)
cli="${UDS_CLI:-$root/uds}"
if [ ! -x "$cli" ]; then cli=$(command -v uds); fi
package="$1"
shift
if [ -z "${CONTROLLER_IMAGE:-}" ] && [ -z "${CONTROLLER_TOOLS_DIR:-}" ]; then
  exec "$cli" zarf package create "$package" "$@"
fi
case "$package" in packages/*) ;; *) echo "Development overrides require a repository packages/ path" >&2; exit 1 ;; esac
scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT
cp -R "$root/src" "$scratch/src"
cp -R "$root/packages" "$scratch/packages"
if [ -n "${CONTROLLER_IMAGE:-}" ]; then
  export CONTROLLER_IMAGE
  "$cli" zarf tools yq -i '(.components[] | select(.name == "uds-controller" or .name == "uds-controller-bootstrap")).images = [strenv(CONTROLLER_IMAGE)]' "$scratch/src/go-controller/zarf.yaml"
  for flavor in upstream unicorn; do
    "$cli" zarf tools yq -i '.image.reference = strenv(CONTROLLER_IMAGE)' "$scratch/src/go-controller/values/$flavor.yaml"
  done
fi
if [ -n "${CONTROLLER_TOOLS_DIR:-}" ]; then
  CONTROLLER_TOOLS_DIR=$(cd "$CONTROLLER_TOOLS_DIR" && pwd)
  export CONTROLLER_TOOLS_DIR
  for platform in linux-amd64 linux-arm64 darwin-amd64 darwin-arm64; do
    test -x "$CONTROLLER_TOOLS_DIR/core-transition-$platform"
  done
  "$cli" zarf tools yq -i '(.components[] | select(.name == "uds-core-tools").files[] | select(.source | contains("/core-transition-"))).source |= strenv(CONTROLLER_TOOLS_DIR) + "/" + split("/")[-1]' "$scratch/src/go-controller/zarf.yaml"
fi
"$cli" zarf package create "$scratch/$package" "$@"
