#!/usr/bin/env bash
# Copyright 2026 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

# Renders one self-contained values test package and evaluates its named checks.
set -euo pipefail

PACKAGE="$1"
SCENARIO="${2:-}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TEST_FILE="$ROOT/test/values/$PACKAGE/test.yaml"
TEMP_DIR="$(mktemp -d)"
VALUES_FILE="$TEMP_DIR/values.yaml"
SCENARIO_FILE="$TEMP_DIR/scenario.yaml"
MANIFESTS="$TEMP_DIR/manifests.yaml"
trap 'rm -rf "$TEMP_DIR"' EXIT

if [ ! -f "$TEST_FILE" ]; then
  echo "ERROR: values test package is missing $TEST_FILE"
  exit 1
fi

uds zarf tools yq '.values' "$TEST_FILE" > "$VALUES_FILE"
EXPECTED_ADMIN_DOMAIN=""
EXPECTED_DOMAIN=""
VARIABLES="DOMAIN=uds.dev"
RENDER_VALUES=(--values "packages/$PACKAGE/zarf-values.yaml" --values "$VALUES_FILE")

if [ -n "$SCENARIO" ]; then
  SCENARIOS_FILE="$TEST_FILE"
  SCENARIO_FILTER=".adminDomainScenarios[] | select(.name == \"$SCENARIO\")"
  if ! uds zarf tools yq -e "$SCENARIO_FILTER" "$SCENARIOS_FILE" >/dev/null; then
    echo "ERROR: admin-domain scenario $SCENARIO does not exist"
    exit 1
  fi
  uds zarf tools yq "$SCENARIO_FILTER | .values" "$SCENARIOS_FILE" > "$SCENARIO_FILE"
  EXPECTED_ADMIN_DOMAIN="$(uds zarf tools yq -r "$SCENARIO_FILTER | .expectedAdminDomain" "$SCENARIOS_FILE")"
  EXPECTED_DOMAIN="$(uds zarf tools yq -r "$SCENARIO_FILTER | .expectedDomain // \"\"" "$SCENARIOS_FILE")"
  VARIABLES="$(uds zarf tools yq -r "$SCENARIO_FILTER | .variables | to_entries | map(.key + \"=\" + .value) | join(\",\")" "$SCENARIOS_FILE")"
  RENDER_VALUES+=(--values "$SCENARIO_FILE")
fi

echo "Verifying value mappings for packages/$PACKAGE${SCENARIO:+ ($SCENARIO)}"
uds zarf dev inspect manifests "packages/$PACKAGE" \
  --flavor upstream \
  "${RENDER_VALUES[@]}" \
  --deploy-set-variables "$VARIABLES" \
  --no-color > "$MANIFESTS"

run_checks() {
  local key="$1"
  local count name description expression index
  count="$(uds zarf tools yq ".$key | length" "$TEST_FILE")"
  [ "$count" = "null" ] && return
  for ((index = 0; index < count; index++)); do
    name="$(uds zarf tools yq -r ".$key[$index].name" "$TEST_FILE")"
    description="$(uds zarf tools yq -r ".$key[$index].description" "$TEST_FILE")"
    expression="$(uds zarf tools yq -r ".$key[$index].expression" "$TEST_FILE")"
    if [ -z "$SCENARIO" ] && ([[ "$expression" == *"{{ adminDomain }}"* ]] || [[ "$expression" == *"{{ domain }}"* ]]); then
      continue
    fi
    expression="${expression//\{\{ adminDomain \}\}/$EXPECTED_ADMIN_DOMAIN}"
    expression="${expression//\{\{ domain \}\}/$EXPECTED_DOMAIN}"
    echo "  [$name] $description"
    if ! uds zarf tools yq ea -e "$expression" "$MANIFESTS" >/dev/null; then
      echo "FAIL $PACKAGE/$name: $description"
      exit 1
    fi
  done
}

run_checks checks

echo "packages/$PACKAGE: OK"
