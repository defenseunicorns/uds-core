#!/usr/bin/env bash
# Copyright 2026 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

# Assertions for the runtime-security package value mappings. Reads rendered multi-doc
# manifests on stdin. Each chart gets a PRESENCE check (settable sentinel landed) and the
# package gets an ABSENCE check (no excludePaths entry leaked SHOULD_NOT_APPEAR). yq exits
# non-zero when a boolean expression is false, so set -e turns any failed assertion into a
# task failure.
set -euo pipefail

MANIFESTS="$(cat)"

# present <chart> <description> <yq-eval-all-boolean-expr>
present() {
  echo "  [$1] present: $2"
  printf '%s\n' "$MANIFESTS" | uds zarf tools yq ea -e "$3" >/dev/null
}

echo "runtime-security: verifying value mappings"

present "falco/falco" "podLabels.probe=PROBE_VISIBLE on the Falco DaemonSet" \
  '[select(.kind == "DaemonSet" and .metadata.name == "falco") | .spec.template.metadata.labels.probe == "PROBE_VISIBLE"] | any'

present "falco/uds-falco-config" "disabledRules sentinel in falco-disable-rules ConfigMap" \
  '[select(.kind == "ConfigMap" and .metadata.name == "falco-disable-rules") | .data["disable-rules.yaml"] | test("PROBE_VISIBLE")] | any'

# ABSENCE: excluded paths must be dropped before Helm renders, so SHOULD_NOT_APPEAR must not
# surface in any rendered string. Covers .falco.falco.image and
# .falco.uds-falco-config.udsDefaultDisabledRulesStable.
echo "  [falco/*] absent: SHOULD_NOT_APPEAR (excludePaths dropped)"
printf '%s\n' "$MANIFESTS" | uds zarf tools yq ea -e '[.. | select(tag == "!!str")] | any_c(test("SHOULD_NOT_APPEAR")) | not' >/dev/null

echo "runtime-security: OK"
