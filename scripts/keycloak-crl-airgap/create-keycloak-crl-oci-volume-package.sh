#!/usr/bin/env bash
# Copyright 2026 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

set -euo pipefail

OUTPUT_DIR="./keycloak-crls"
PACKAGE_VERSION="local"
IMAGE_REF="keycloak-crls:local"
CRL_ZIP_URL="https://crl.gds.disa.mil/getcrlzip?ALL+CRL+ZIP"

CRL_ZIP_PATH=""
INCLUDE_EMAIL="false"
INCLUDE_SW="false"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --crl-zip) CRL_ZIP_PATH="$2"; shift 2 ;;
    --include-email) INCLUDE_EMAIL="true"; shift ;;
    --include-sw) INCLUDE_SW="true"; shift ;;
    -h|--help) echo "Usage: $0 [--crl-zip PATH] [--include-email] [--include-sw]"; exit 0 ;;
    *) echo "unknown arg: $1" >&2; echo "Usage: $0 [--crl-zip PATH] [--include-email] [--include-sw]" >&2; exit 2 ;;
  esac
done

ZARF=(uds zarf)

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

zip="$tmp/crls.zip"
unz="$tmp/unzipped"
stage="$tmp/stage"
mkdir -p "$unz" "$stage" "$OUTPUT_DIR"

# Get ZIP
if [ -n "$CRL_ZIP_PATH" ]; then
  cp -f "$CRL_ZIP_PATH" "$zip"
else
  curl -fL -o "$zip" "$CRL_ZIP_URL"
fi

# Unzip
unzip -q "$zip" -d "$unz"

# Filter + stage
while IFS= read -r -d '' crl; do
  base="$(basename "$crl")"
  upper="$(printf '%s' "$base" | tr '[:lower:]' '[:upper:]')"

  if [ "$INCLUDE_EMAIL" = "false" ] && [[ "$upper" == DODEMAIL* ]]; then
    continue
  fi
  if [ "$INCLUDE_SW" = "false" ] && [[ "$upper" == DODSW* ]]; then
    continue
  fi

  cp -f "$crl" "$stage/$base"
done < <(find "$unz" -type f -iname '*.crl' -print0)

# Generate Keycloak CRL Path list (sorted, ## delimited)
paths_file="$OUTPUT_DIR/keycloak-crl-paths.txt"
crl_list="$(ls -1 "$stage" 2>/dev/null | sort || true)"
if [ -z "$crl_list" ]; then
  echo "no CRLs after filtering (try --include-email and/or --include-sw)" >&2
  exit 1
fi

CRL_PATH_LIST=""
while IFS= read -r filename; do
  entry="../../../tmp/keycloak-crls/${filename}"
  if [ -z "$CRL_PATH_LIST" ]; then
    CRL_PATH_LIST="$entry"
  else
    CRL_PATH_LIST="${CRL_PATH_LIST}##${entry}"
  fi
done <<< "$crl_list"
printf '%s\n' "$CRL_PATH_LIST" > "$paths_file"

# Build data image
cat > "$tmp/Dockerfile" <<'EOF'
FROM scratch
COPY stage/ /
EOF
docker build -q -t "$IMAGE_REF" -f "$tmp/Dockerfile" "$tmp"

# Create package from a TEMP package directory so we don't leave zarf.yaml in OUTPUT_DIR
pkgdir="$tmp/pkg"
mkdir -p "$pkgdir"

cat > "$pkgdir/zarf.yaml" <<EOF
kind: ZarfPackageConfig
metadata:
  name: keycloak-crls
  description: "DoD CRLs for Keycloak X.509 (OCI volume)"
  version: "${PACKAGE_VERSION}"
components:
  - name: keycloak-crls
    required: true
    images:
      - ${IMAGE_REF}
EOF

"${ZARF[@]}" package create "$pkgdir" --confirm --output "$OUTPUT_DIR"

echo "Done. Outputs:"
echo "  - Keycloak CRL Path value: $paths_file"
echo "  - Zarf package:            $(ls -1 "$OUTPUT_DIR"/zarf-package-keycloak-crls-*.tar.zst 2>/dev/null || true)"