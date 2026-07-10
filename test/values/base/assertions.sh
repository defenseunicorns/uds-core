#!/usr/bin/env bash
# Copyright 2026 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

# Assertions for the base package value mappings. Reads rendered multi-doc manifests on stdin.
# Each deployed chart gets a PRESENCE check (settable sentinel landed) and the package gets an
# ABSENCE check (no excludePaths entry leaked SHOULD_NOT_APPEAR). yq exits non-zero when a
# boolean expression is false, so set -e turns any failed assertion into a task failure.
#
# uds-envoy-gateway-config has no presence sentinel because its GatewayClass and Package templates
# are static. The Istio base chart has settable fields (for example, global.imagePullSecrets), but
# this test uses only its excluded global.hub path for absence coverage.
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
  present "istio-admin-gateway/uds-istio-config" "admin Gateway host is $1" \
    "[select(.kind == \"Gateway\" and .metadata.namespace == \"istio-admin-gateway\") | .spec.servers[].hosts[] | test(\"$ADMIN_DOMAIN_EXPECTED$\")] | any"
  present "uds-operator-config/uds-operator-config" "ClusterConfig admin domain is $1" \
    "[select(.kind == \"ClusterConfig\" and .metadata.name == \"uds-cluster-config\") | .spec.expose.adminDomain == \"$ADMIN_DOMAIN_EXPECTED\"] | any"
}

echo "base: verifying value mappings"

present "pepr-uds-core/module" "admission.podLabels.probe on the pepr-uds-core Deployment" \
  '[select(.kind == "Deployment" and .metadata.name == "pepr-uds-core" and .metadata.namespace == "pepr-system") | .spec.template.metadata.labels.probe == "PROBE_VISIBLE_PEPR"] | any'

present "uds-operator-config/uds-operator-config" "cluster.attributes.clusterName in the ClusterConfig CR" \
  '[select(.kind == "ClusterConfig" and .metadata.name == "uds-cluster-config") | .spec.attributes.clusterName == "PROBE_VISIBLE_OPERATOR"] | any'

present "istio-controlplane/istiod" "podLabels.probe on the istiod Deployment" \
  '[select(.kind == "Deployment" and .metadata.name == "istiod") | .spec.template.metadata.labels.probe == "PROBE_VISIBLE_ISTIOD"] | any'

present "istio-controlplane/uds-global-istio-config" "enabledHosts entry in the classification-banner EnvoyFilter" \
  '[select(.kind == "EnvoyFilter" and .metadata.name == "classification-banner") | .. | select(tag == "!!str") | test("probe-visible-global")] | any'

present "istio-controlplane/cni" "podLabels.probe on the istio-cni-node DaemonSet" \
  '[select(.kind == "DaemonSet" and .metadata.name == "istio-cni-node") | .spec.template.metadata.labels.probe == "PROBE_VISIBLE_CNI"] | any'

present "istio-controlplane/ztunnel" "podLabels.probe on the ztunnel DaemonSet" \
  '[select(.kind == "DaemonSet" and .metadata.name == "ztunnel") | .spec.template.metadata.labels.probe == "PROBE_VISIBLE_ZTUNNEL"] | any'

present "istio-admin-gateway/gateway" "labels.probe on the admin-ingressgateway Deployment" \
  '[select(.kind == "Deployment" and .metadata.name == "admin-ingressgateway") | .spec.template.metadata.labels.probe == "PROBE_VISIBLE_ADMIN"] | any'

present "istio-admin-gateway/uds-istio-config" "rootDomain credentialName in the admin Gateway" \
  '[select(.kind == "Gateway" and .metadata.namespace == "istio-admin-gateway") | .. | select(tag == "!!str") | test("PROBE_VISIBLE_ADMINCFG")] | any'

present "istio-tenant-gateway/gateway" "labels.probe on the tenant-ingressgateway Deployment" \
  '[select(.kind == "Deployment" and .metadata.name == "tenant-ingressgateway") | .spec.template.metadata.labels.probe == "PROBE_VISIBLE_TENANT"] | any'

present "istio-tenant-gateway/uds-istio-config" "rootDomain credentialName in the tenant Gateway" \
  '[select(.kind == "Gateway" and .metadata.namespace == "istio-tenant-gateway") | .. | select(tag == "!!str") | test("PROBE_VISIBLE_TENANTCFG")] | any'

present "istio-passthrough-gateway/gateway" "labels.probe on the passthrough-ingressgateway Deployment" \
  '[select(.kind == "Deployment" and .metadata.name == "passthrough-ingressgateway") | .spec.template.metadata.labels.probe == "PROBE_VISIBLE_PASSTHROUGH"] | any'

present "istio-passthrough-gateway/uds-istio-config" "rootDomain credentialName in the passthrough Gateway" \
  '[select(.kind == "Gateway" and .metadata.namespace == "istio-passthrough-gateway") | .. | select(tag == "!!str") | test("PROBE_VISIBLE_PASSTHROUGHCFG")] | any'

present "istio-egress-ambient/uds-istio-egress-config" "serviceAccount overlay in the egress-waypoint-config ConfigMap" \
  '[select(.kind == "ConfigMap" and .metadata.name == "egress-waypoint-config") | .data.serviceAccount | test("PROBE_VISIBLE_EGRESSCFG")] | any'

present "istio-egress-gateway/gateway" "labels.probe on the egressgateway Deployment" \
  '[select(.kind == "Deployment" and .metadata.name == "egressgateway") | .spec.template.metadata.labels.probe == "PROBE_VISIBLE_EGRESS"] | any'

present "envoy-gateway/envoy-gateway" "deployment.pod.labels.probe on the envoy-gateway Deployment" \
  '[select(.kind == "Deployment" and .metadata.name == "envoy-gateway" and .metadata.namespace == "envoy-gateway-system") | .spec.template.metadata.labels.probe == "PROBE_VISIBLE_ENVOY"] | any'

if [ -n "$ADMIN_DOMAIN_EXPECTED" ]; then
  admin_domain "$ADMIN_DOMAIN_EXPECTED"
fi

# ABSENCE: excluded paths must be dropped before Helm renders, so SHOULD_NOT_APPEAR must not
# surface in any rendered string. Covers the excludePaths of pepr module (admission.image), istio
# base/istiod/cni (global.hub), ztunnel (image), the four gateways (global.hub), the three
# uds-istio-config charts (name), and the two envoy charts (image paths).
echo "  [base/*] absent: SHOULD_NOT_APPEAR (excludePaths dropped)"
uds zarf tools yq ea -e '[.. | select(tag == "!!str")] | any_c(test("SHOULD_NOT_APPEAR")) | not' "$MANIFESTS" >/dev/null

echo "base: OK"
