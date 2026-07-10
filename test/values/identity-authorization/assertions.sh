#!/usr/bin/env bash
# Copyright 2026 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

# Assertions for the identity-authorization package value mappings. Reads rendered multi-doc
# manifests on stdin. Each chart gets a PRESENCE check (settable sentinel landed) and the
# package gets an ABSENCE check (no excludePaths entry leaked SHOULD_NOT_APPEAR). yq exits
# non-zero when a boolean expression is false, so set -e turns any failed assertion into a
# task failure.
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
  present "keycloak/keycloak" "UDS_ADMIN_DOMAIN is $1" \
    "[select(.kind == \"StatefulSet\" and .metadata.name == \"keycloak\") | .spec.template.spec.containers[].env[] | select(.name == \"UDS_ADMIN_DOMAIN\") | .value == \"$ADMIN_DOMAIN_EXPECTED\"] | any"
}

echo "identity-authorization: verifying value mappings"

present "keycloak/keycloak" "podLabels.probe=PROBE_VISIBLE on the Keycloak StatefulSet" \
  '[select(.kind == "StatefulSet" and .metadata.name == "keycloak") | .spec.template.metadata.labels.probe == "PROBE_VISIBLE"] | any'

present "authservice/authservice" "replicaCount=7 on the Authservice Deployment" \
  '[select(.kind == "Deployment" and .metadata.name == "authservice") | .spec.replicas == 7] | any'

if [ -n "$ADMIN_DOMAIN_EXPECTED" ]; then
  admin_domain "$ADMIN_DOMAIN_EXPECTED"
fi

# ABSENCE: excluded paths must be dropped before Helm renders, so SHOULD_NOT_APPEAR must not
# surface in any rendered string. Covers .keycloak.keycloak.image and
# .authservice.authservice.image.
echo "  [keycloak/*, authservice/*] absent: SHOULD_NOT_APPEAR (excludePaths dropped)"
uds zarf tools yq ea -e '[.. | select(tag == "!!str")] | any_c(test("SHOULD_NOT_APPEAR")) | not' "$MANIFESTS" >/dev/null

echo "identity-authorization: OK"
