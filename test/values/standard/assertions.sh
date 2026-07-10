#!/usr/bin/env bash
# Copyright 2026 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

# Assertions for the standard (full core) package value mappings. Reads rendered multi-doc
# manifests on stdin. Each mapped chart gets a PRESENCE check (settable sentinel landed) and the
# package gets one ABSENCE check (no excludePaths entry leaked SHOULD_NOT_APPEAR). yq exits
# non-zero when a boolean expression is false, so set -e turns any failed assertion into a task
# failure. standard is the union of all layers, so metrics-server and velero (in no other tested
# package) are covered here.
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
  present "keycloak/keycloak" "UDS_ADMIN_DOMAIN is $1" \
    "[select(.kind == \"StatefulSet\" and .metadata.name == \"keycloak\") | .spec.template.spec.containers[].env[] | select(.name == \"UDS_ADMIN_DOMAIN\") | .value == \"$ADMIN_DOMAIN_EXPECTED\"] | any"
  present "grafana/grafana" "grafana.ini root_url uses $1" \
    "[select(.kind == \"ConfigMap\" and .metadata.name == \"grafana\") | .data[\"grafana.ini\"] | test(\"root_url = https://grafana\\\\.$ADMIN_DOMAIN_EXPECTED\")] | any"
  present "grafana/uds-grafana-config" "redirect URI uses $1" \
    "[select(.kind == \"Package\" and .metadata.name == \"grafana\") | .spec.sso[0].redirectUris[] == \"https://grafana.$ADMIN_DOMAIN_EXPECTED/login/generic_oauth\"] | any"
}

echo "standard: verifying value mappings"

# --- base: pepr / operator config ---
present "pepr-uds-core/module" "admission podLabels.probe on pepr-uds-core Deployment" \
  '[select(.kind == "Deployment" and .metadata.namespace == "pepr-system" and .metadata.name == "pepr-uds-core") | .spec.template.metadata.labels.probe == "PROBE_PEPR"] | any'
present "uds-operator-config/uds-operator-config" "clusterName sentinel on the ClusterConfig" \
  '[select(.kind == "ClusterConfig" and .metadata.name == "uds-cluster-config") | .spec.attributes.clusterName == "PROBE_OPERATOR"] | any'

# --- base: istio control plane ---
present "istio-controlplane/base" "imagePullSecrets sentinel on istio-reader ServiceAccount" \
  '[select(.kind == "ServiceAccount" and .metadata.name == "istio-reader-service-account") | .imagePullSecrets[].name == "PROBE_BASE"] | any'
present "istio-controlplane/istiod" "pilot podLabels.probe on the istiod Deployment" \
  '[select(.kind == "Deployment" and .metadata.namespace == "istio-system" and .metadata.name == "istiod") | .spec.template.metadata.labels.probe == "PROBE_ISTIOD"] | any'
present "istio-controlplane/cni" "podLabels.probe on the istio-cni-node DaemonSet" \
  '[select(.kind == "DaemonSet" and .metadata.name == "istio-cni-node") | .spec.template.metadata.labels.probe == "PROBE_CNI"] | any'
present "istio-controlplane/ztunnel" "podLabels.probe on the ztunnel DaemonSet" \
  '[select(.kind == "DaemonSet" and .metadata.name == "ztunnel") | .spec.template.metadata.labels.probe == "PROBE_ZTUNNEL"] | any'
present "istio-controlplane/uds-global-istio-config" "classificationBanner text in the classification-banner EnvoyFilter" \
  '[select(.kind == "EnvoyFilter" and .metadata.name == "classification-banner") | @json | test("PROBE_GLOBALISTIO")] | any'

# --- base: istio gateways ---
present "istio-admin-gateway/gateway" "labels.probe on the admin-ingressgateway Deployment" \
  '[select(.kind == "Deployment" and .metadata.namespace == "istio-admin-gateway") | .metadata.labels.probe == "PROBE_ADMINGW"] | any'
present "istio-admin-gateway/uds-istio-config" "tls.credentialName sentinel on the admin Gateway" \
  '[select(.kind == "Gateway" and .metadata.namespace == "istio-admin-gateway") | .spec.servers[].tls.credentialName == "PROBE_ADMINCFG"] | any'
present "istio-tenant-gateway/gateway" "labels.probe on the tenant-ingressgateway Deployment" \
  '[select(.kind == "Deployment" and .metadata.namespace == "istio-tenant-gateway") | .metadata.labels.probe == "PROBE_TENANTGW"] | any'
present "istio-tenant-gateway/uds-istio-config" "tls.credentialName sentinel on the tenant Gateway" \
  '[select(.kind == "Gateway" and .metadata.namespace == "istio-tenant-gateway") | .spec.servers[].tls.credentialName == "PROBE_TENANTCFG"] | any'
present "istio-passthrough-gateway/gateway" "labels.probe on the passthrough-ingressgateway Deployment" \
  '[select(.kind == "Deployment" and .metadata.namespace == "istio-passthrough-gateway") | .metadata.labels.probe == "PROBE_PASSGW"] | any'
present "istio-passthrough-gateway/uds-istio-config" "tls.credentialName sentinel on the passthrough Gateway" \
  '[select(.kind == "Gateway" and .metadata.namespace == "istio-passthrough-gateway") | .spec.servers[].tls.credentialName == "PROBE_PASSCFG"] | any'
present "istio-egress-ambient/uds-istio-egress-config" "serviceAccount annotation in egress-waypoint-config ConfigMap" \
  '[select(.kind == "ConfigMap" and .metadata.name == "egress-waypoint-config") | .data.serviceAccount | test("PROBE_EGRESS")] | any'
present "istio-egress-gateway/gateway" "labels.probe on the egressgateway Deployment" \
  '[select(.kind == "Deployment" and .metadata.namespace == "istio-egress-gateway") | .metadata.labels.probe == "PROBE_EGRESSGW"] | any'

# --- base: envoy gateway ---
present "envoy-gateway/envoy-gateway" "deployment.pod.labels.probe on the envoy-gateway Deployment" \
  '[select(.kind == "Deployment" and .metadata.namespace == "envoy-gateway-system" and .metadata.name == "envoy-gateway") | .spec.template.metadata.labels.probe == "PROBE_ENVOY"] | any'
# envoy-gateway/uds-envoy-gateway-config is a static chart (no .Values refs, no excludePaths):
# no value surface to assert; its mapped sourcePath is supplied by the default values file.

# --- base: prometheus stack ---
present "kube-prometheus-stack/kube-prometheus-stack" "commonLabels.probe on the prometheus operator Deployment" \
  '[select(.kind == "Deployment" and .metadata.name == "kube-prometheus-stack-operator") | .metadata.labels.probe == "PROBE_KPS"] | any'
present "kube-prometheus-stack/uds-prometheus-config" "additionalNetworkAllow description in the monitoring Package" \
  '[select(.kind == "Package" and .metadata.namespace == "monitoring") | .spec.network.allow[].description == "PROBE_PROMCFG"] | any'
present "prometheus-blackbox-exporter/prometheus-blackbox-exporter" "podAnnotations.probe on the blackbox Deployment" \
  '[select(.kind == "Deployment" and .metadata.name == "prometheus-blackbox-exporter") | .spec.template.metadata.annotations.probe == "PROBE_BLACKBOX"] | any'

# --- identity-authorization ---
present "keycloak/keycloak" "additionalNetworkAllow description in the keycloak Package" \
  '[select(.kind == "Package" and .metadata.namespace == "keycloak") | .spec.network.allow[].description == "PROBE_KEYCLOAK"] | any'
present "authservice/authservice" "podAnnotations.probe on the authservice Deployment" \
  '[select(.kind == "Deployment" and .metadata.namespace == "authservice") | .spec.template.metadata.annotations.probe == "PROBE_AUTHSERVICE"] | any'

# --- logging ---
present "loki/loki" "podLabels.probe on the loki-write StatefulSet" \
  '[select(.kind == "StatefulSet" and .metadata.name == "loki-write") | .spec.template.metadata.labels.probe == "PROBE_LOKI"] | any'
present "loki/uds-loki-config" "additionalNetworkAllow description in the loki Package" \
  '[select(.kind == "Package" and .metadata.namespace == "loki") | .spec.network.allow[].description == "PROBE_LOKICFG"] | any'
present "vector/vector" "podLabels.probe on the vector DaemonSet" \
  '[select(.kind == "DaemonSet" and .metadata.namespace == "vector" and .metadata.name == "vector") | .spec.template.metadata.labels.probe == "PROBE_VECTOR"] | any'
present "vector/uds-vector-config" "additionalNetworkAllow description in the vector Package" \
  '[select(.kind == "Package" and .metadata.namespace == "vector") | .spec.network.allow[].description == "PROBE_VECTORCFG"] | any'

# --- monitoring: grafana ---
present "grafana/grafana" "podLabels.probe on the grafana Deployment" \
  '[select(.kind == "Deployment" and .metadata.namespace == "grafana" and .metadata.name == "grafana") | .spec.template.metadata.labels.probe == "PROBE_GRAFANA"] | any'
present "grafana/uds-grafana-config" "additionalNetworkAllow description in the grafana Package" \
  '[select(.kind == "Package" and .metadata.namespace == "grafana") | .spec.network.allow[].description == "PROBE_GRAFANACFG"] | any'

# --- runtime-security: falco ---
present "falco/falco" "podLabels.probe on the Falco DaemonSet" \
  '[select(.kind == "DaemonSet" and .metadata.name == "falco") | .spec.template.metadata.labels.probe == "PROBE_FALCO"] | any'
present "falco/uds-falco-config" "disabledRules sentinel in falco-disable-rules ConfigMap" \
  '[select(.kind == "ConfigMap" and .metadata.name == "falco-disable-rules") | .data["disable-rules.yaml"] | test("PROBE_FALCOCFG")] | any'

# --- metrics-server (standard-only) ---
present "metrics-server/metrics-server" "podLabels.probe on the metrics-server Deployment" \
  '[select(.kind == "Deployment" and .metadata.namespace == "metrics-server" and .metadata.name == "metrics-server") | .spec.template.metadata.labels.probe == "PROBE_METRICS"] | any'
# metrics-server/uds-metrics-server-config is a static chart (empty values.yaml, no .Values refs,
# no excludePaths): no value surface to assert; sourcePath supplied by the default values file.

# --- portal ---
present "uds-portal/uds-portal" "replicaCount sentinel (7) on the uds-portal Deployment" \
  '[select(.kind == "Deployment" and .metadata.namespace == "uds-portal" and .metadata.name == "uds-portal") | .spec.replicas == 7] | any'

# --- backup-restore: velero (standard-only) ---
present "velero/velero" "podLabels.probe on the velero Deployment" \
  '[select(.kind == "Deployment" and .metadata.namespace == "velero" and .metadata.name == "velero") | .spec.template.metadata.labels.probe == "PROBE_VELERO"] | any'
present "velero/uds-velero-config" "storage.egressCidr sentinel as remoteCidr in the velero Package" \
  '[select(.kind == "Package" and .metadata.namespace == "velero") | .spec.network.allow[].remoteCidr == "10.234.56.78/32"] | any'

if [ -n "$ADMIN_DOMAIN_EXPECTED" ]; then
  admin_domain "$ADMIN_DOMAIN_EXPECTED"
fi

# ABSENCE: every excludePaths entry above was set to SHOULD_NOT_APPEAR; if the values pipeline
# failed to drop any of them it would surface in a rendered string. Covers the image/registry,
# securityContext, hub/tag, name, and domain excludePaths across all charts that declare them.
echo "  [standard/*] absent: SHOULD_NOT_APPEAR (all excludePaths dropped)"
uds zarf tools yq ea -e '[.. | select(tag == "!!str")] | any_c(test("SHOULD_NOT_APPEAR")) | not' "$MANIFESTS" >/dev/null

echo "standard: OK"
