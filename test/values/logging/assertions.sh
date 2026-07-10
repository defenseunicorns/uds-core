#!/usr/bin/env bash
# Copyright 2026 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

# Assertions for the logging package value mappings. Reads rendered multi-doc manifests on
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

echo "logging: verifying value mappings"

present "loki/loki" "podLabels.probe=PROBE_VISIBLE on the loki-write StatefulSet" \
  '[select(.kind == "StatefulSet" and .metadata.name == "loki-write") | .spec.template.metadata.labels.probe == "PROBE_VISIBLE"] | any'

present "loki/uds-loki-config" "additionalNetworkAllow sentinel in the loki Package CR" \
  '[select(.kind == "Package" and .metadata.name == "loki") | .spec.network.allow[] | .description == "PROBE_VISIBLE"] | any'

present "vector/vector" "podLabels.probe=PROBE_VISIBLE on the vector DaemonSet" \
  '[select(.kind == "DaemonSet" and .metadata.name == "vector") | .spec.template.metadata.labels.probe == "PROBE_VISIBLE"] | any'

present "vector/uds-vector-config" "additionalNetworkAllow sentinel in the vector Package CR" \
  '[select(.kind == "Package" and .metadata.name == "vector") | .spec.network.allow[] | .description == "PROBE_VISIBLE"] | any'

# ABSENCE: excluded paths must be dropped before Helm renders, so SHOULD_NOT_APPEAR must not
# surface in any rendered string. Covers .loki.loki.global.imageRegistry and
# .vector.vector.image (the uds-*-config charts define no excludePaths).
echo "  [loki/*, vector/*] absent: SHOULD_NOT_APPEAR (excludePaths dropped)"
printf '%s\n' "$MANIFESTS" | uds zarf tools yq ea -e '[.. | select(tag == "!!str")] | any_c(test("SHOULD_NOT_APPEAR")) | not' >/dev/null

echo "logging: OK"
