#!/usr/bin/env bash
# Copyright 2026 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

# Assertions for the monitoring package value mappings. Reads rendered multi-doc manifests on
# stdin. Each chart gets a PRESENCE check (settable sentinel landed) and the package gets an
# ABSENCE check (no excludePaths entry leaked SHOULD_NOT_APPEAR). yq exits non-zero when a
# boolean expression is false, so set -e turns any failed assertion into a task failure.
set -euo pipefail

MANIFESTS="$(mktemp)"
trap 'rm -f "$MANIFESTS"' EXIT
tee "$MANIFESTS" >/dev/null
ADMIN_DOMAIN_EXPECTED="${1:-}"

# present <chart> <description> <yq-eval-all-boolean-expr>
present() {
  echo "  [$1] present: $2"
  uds zarf tools yq ea -e "$3" "$MANIFESTS" >/dev/null
}

admin_domain() {
  echo "  [admin-domain] $1"
  present "grafana/grafana" "grafana.ini root_url uses $1" \
    "[select(.kind == \"ConfigMap\" and .metadata.name == \"grafana\") | .data[\"grafana.ini\"] | test(\"root_url = https://grafana\\\\.$ADMIN_DOMAIN_EXPECTED\")] | any"
  present "grafana/uds-grafana-config" "redirect URI uses $1" \
    "[select(.kind == \"Package\" and .metadata.name == \"grafana\") | .spec.sso[0].redirectUris[] == \"https://grafana.$ADMIN_DOMAIN_EXPECTED/login/generic_oauth\"] | any"
}

echo "monitoring: verifying value mappings"

present "kube-prometheus-stack/kube-prometheus-stack" "prometheusSpec.replicas=7 on the Prometheus CR" \
  '[select(.kind == "Prometheus" and .metadata.name == "kube-prometheus-stack-prometheus") | .spec.replicas == 7] | any'

present "kube-prometheus-stack/uds-prometheus-config" "additionalNetworkAllow sentinel on the prometheus-stack Package" \
  '[select(.kind == "Package" and .metadata.name == "prometheus-stack") | .spec.network.allow[] | select(.description == "PROBE_VISIBLE")] | length > 0'

present "prometheus-blackbox-exporter/prometheus-blackbox-exporter" "replicas=7 on the blackbox-exporter Deployment" \
  '[select(.kind == "Deployment" and .metadata.name == "prometheus-blackbox-exporter") | .spec.replicas == 7] | any'

present "grafana/grafana" "extraLabels.probe=PROBE_VISIBLE on the Grafana Deployment" \
  '[select(.kind == "Deployment" and .metadata.name == "grafana") | .metadata.labels.probe == "PROBE_VISIBLE"] | any'

present "grafana/uds-grafana-config" "additionalNetworkAllow sentinel on the grafana Package" \
  '[select(.kind == "Package" and .metadata.name == "grafana") | .spec.network.allow[] | select(.description == "PROBE_VISIBLE")] | length > 0'

if [ -n "$ADMIN_DOMAIN_EXPECTED" ]; then
  admin_domain "$ADMIN_DOMAIN_EXPECTED"
fi

# ABSENCE: excluded paths must be dropped before Helm renders, so SHOULD_NOT_APPEAR must not
# surface in any rendered string. Covers .kube-prometheus-stack.kube-prometheus-stack.global.imageRegistry,
# .prometheus-blackbox-exporter.prometheus-blackbox-exporter.image, .grafana.grafana.image, and
# .grafana.uds-grafana-config.adminDomain. (uds-prometheus-config carries no excludePaths.)
echo "  [monitoring/*] absent: SHOULD_NOT_APPEAR (excludePaths dropped)"
uds zarf tools yq ea -e '[.. | select(tag == "!!str")] | any_c(test("SHOULD_NOT_APPEAR")) | not' "$MANIFESTS" >/dev/null

echo "monitoring: OK"
