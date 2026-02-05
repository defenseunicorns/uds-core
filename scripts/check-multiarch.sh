#!/bin/bash
# Copyright 2025 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

set -e  # Exit on error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_DIR="${1:-$SCRIPT_DIR/../src}"

# Create temporary files and ensure cleanup no matter script outcome
TEMP_IMAGES=$(mktemp)
TEMP_MISSING=$(mktemp)
trap "rm -f $TEMP_IMAGES $TEMP_MISSING" EXIT

echo "Scanning $SRC_DIR for unicorn and registry1 images..."

# Extract all quay.io/rfcurated/ (unicorn) and registry1.dso.mil/ironbank/ (registry1) images
find "$SRC_DIR" -name "zarf.yaml" -type f -exec grep -hE "quay.io/rfcurated/|registry1.dso.mil/ironbank/" {} \; | \
    sed 's/^[[:space:]]*-[[:space:]]*//' | \
    sed 's/"//g' | \
    sort -u > "$TEMP_IMAGES"

TOTAL=$(wc -l < "$TEMP_IMAGES")
echo "Found $TOTAL images"
echo ""

# Check each image
COUNT=0
> "$TEMP_MISSING"

cat "$TEMP_IMAGES" | while read -r IMAGE; do
    COUNT=$((COUNT + 1))
    echo "[$COUNT/$TOTAL] $IMAGE"

    MANIFEST=$(crane manifest "$IMAGE" 2>/dev/null || echo "")

    if [ -z "$MANIFEST" ]; then
        echo "  ERROR: Failed to fetch"
        echo "$IMAGE" >> "$TEMP_MISSING"
        continue
    fi

    AMD64=$(echo "$MANIFEST" | jq -r '.manifests[]?.platform.architecture' 2>/dev/null | grep -c "amd64" || echo "0" | tr -d '\n')
    ARM64=$(echo "$MANIFEST" | jq -r '.manifests[]?.platform.architecture' 2>/dev/null | grep -c "arm64" || echo "0" | tr -d '\n')

    # Ensure we have clean integers
    AMD64=${AMD64//[^0-9]/}
    ARM64=${ARM64//[^0-9]/}
    AMD64=${AMD64:-0}
    ARM64=${ARM64:-0}

    missing_arches=()
    [ "$AMD64" -eq 0 ] && missing_arches+=("amd64")
    [ "$ARM64" -eq 0 ] && missing_arches+=("arm64")

    if [ ${#missing_arches[@]} -gt 0 ]; then
        missing_key=$(IFS=,; echo "${missing_arches[*]}")
        available_arches=$(echo "$MANIFEST" | jq -r '.manifests[]?.platform.architecture // .architecture // "unknown"' 2>/dev/null | paste -sd "," -)
        echo "  ✗ MISSING [$missing_key]"${available_arches:+" (found: $available_arches)"}
        echo "$missing_key|$IMAGE" >> "$TEMP_MISSING"
    else
        echo "  ✓ OK"
    fi
done

echo ""
echo "=========================================="
MISSING_COUNT=$(wc -l < "$TEMP_MISSING")
echo "Images missing amd64/arm64: $MISSING_COUNT"

if [ "$MISSING_COUNT" -gt 0 ]; then
    echo ""
    echo "Missing multi-arch support:"
    cat "$TEMP_MISSING"
    exit 1
fi
