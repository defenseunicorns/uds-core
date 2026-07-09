#!/usr/bin/env bash
# Copyright 2026 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
#
# Assert every domain-consuming chart maps the shared top-level `.domain` key.
# Guards against silently dropping a chart from the top-level domain fan-out.
set -euo pipefail

YQ="uds zarf tools yq"

# file:chart:component:keys entries. Each MUST have a `.<key>` sourcePath mapping
# for every key in the comma-separated `keys` list (domain and/or adminDomain).
# component is only needed when a chart name (e.g. "uds-istio-config") is reused
# across multiple components in the same file and must be disambiguated.
declare -a CHECKS=(
  "src/keycloak/common/zarf.yaml:keycloak::domain,adminDomain"
  "src/pepr/zarf.yaml:uds-operator-config::domain,adminDomain"
  "src/istio/zarf.yaml:uds-istio-config:istio-tenant-gateway:domain"
  "src/istio/zarf.yaml:uds-istio-config:istio-admin-gateway:domain,adminDomain"
  "src/istio/zarf.yaml:uds-istio-config:istio-passthrough-gateway:domain"
  "src/grafana/common/zarf.yaml:uds-grafana-config::domain,adminDomain"
  "src/grafana/common/zarf.yaml:grafana::domain,adminDomain"
  "src/portal/common/zarf.yaml:uds-portal::domain,adminDomain"
)

fail=0
for entry in "${CHECKS[@]}"; do
  IFS=':' read -r file chart component keys <<< "$entry"
  IFS=',' read -r -a required_keys <<< "$keys"
  for key in "${required_keys[@]}"; do
    if [ -n "$component" ]; then
      query="[.components[] | select(.name == \"${component}\") | .charts[] | select(.name == \"${chart}\") | .values[]? | select(.sourcePath == \".${key}\")] | length"
      label="chart '${chart}' in component '${component}'"
    else
      query="[.components[].charts[] | select(.name == \"${chart}\") | .values[]? | select(.sourcePath == \".${key}\")] | length"
      label="chart '${chart}'"
    fi
    found=$($YQ "$query" "$file")
    if [ "$found" -lt 1 ]; then
      echo "MISSING ${key} fan-out mapping: ${label} in ${file}"
      fail=1
    fi
  done
done

if [ "$fail" -ne 0 ]; then
  echo "❌ domain fan-out lint failed"
  exit 1
fi
echo "✅ domain fan-out lint passed"
