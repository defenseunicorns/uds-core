#!/usr/bin/env bash
# Copyright 2026 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

# Assertions for the portal package value mappings. Reads rendered multi-doc manifests on
# stdin. Each chart gets a PRESENCE check (settable sentinel landed) and the package gets an
# ABSENCE check (no excludePaths entry leaked SHOULD_NOT_APPEAR). yq exits non-zero when a
# boolean expression is false, so set -e turns any failed assertion into a task failure.
set -euo pipefail

MANIFESTS="$(cat)"

# present <chart> <description> <yq-eval-all-boolean-expr>
present() {
  echo "  [$1] present: $2"
  printf '%s\n' "$MANIFESTS" | uds zarf tools yq ea -e "$3" >/dev/null
}

echo "portal: verifying value mappings"

present "uds-portal/uds-portal" "replicaCount=7 on the uds-portal Deployment" \
  '[select(.kind == "Deployment" and .metadata.name == "uds-portal") | .spec.replicas == 7] | any'

# ABSENCE: excluded paths must be dropped before Helm renders, so SHOULD_NOT_APPEAR must not
# surface in any rendered string. Covers .uds-portal.uds-portal.image.
echo "  [uds-portal/*] absent: SHOULD_NOT_APPEAR (excludePaths dropped)"
printf '%s\n' "$MANIFESTS" | uds zarf tools yq ea -e '[.. | select(tag == "!!str")] | any_c(test("SHOULD_NOT_APPEAR")) | not' >/dev/null

echo "portal: OK"
