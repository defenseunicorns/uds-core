#!/usr/bin/env bash
# Copyright 2026 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
set -euo pipefail
flavor="$1"
arch="$2"
tag="$3"
mode="${4:-test}"
output="build/controller/$flavor/$arch"
image=$(python3 src/go-controller/hack/build-image.py --flavor "$flavor" --architecture "$arch" --tag "$tag" --output "$output")
docker run --rm --network none "$image" --build-info > "$output/runtime.json"
python3 - "$output" "$flavor" <<'PY'
import json,sys
from pathlib import Path
out=Path(sys.argv[1])
runtime=json.loads((out/'runtime.json').read_text())
if runtime['Flavor'] != sys.argv[2]:
    raise ValueError('Runtime flavor differs from receipt')
if sys.argv[2]=='unicorn' and (not runtime['FIPSEnabled'] or not (runtime['GOFIPS140']=='v1.0.0' or runtime['GOFIPS140'].startswith('v1.0.0-'))):
    raise ValueError('Unicorn runtime did not enable the pinned FIPS module')
receipt=json.loads((out/'receipt.json').read_text())
receipt['runtime']=runtime
(out/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
PY
syft "$image" -o "spdx-json=$output/sbom.spdx.json"
if [ "$mode" = publish ]; then
  case "${GITHUB_REF:-}" in
    refs/tags/v*) ;;
    refs/heads/main)
      if [ "${GITHUB_EVENT_NAME:-}" != schedule ]; then echo 'Main image publication requires the scheduled release workflow' >&2; exit 1; fi ;;
    *) echo 'Image publication requires a release tag or scheduled main release' >&2; exit 1 ;;
  esac
  if [ "$flavor" = unicorn ]; then
    visibility_error=$(mktemp)
    trap 'rm -f "$visibility_error"' EXIT
    if visibility=$(gh api orgs/defenseunicorns/packages/container/packages%2Fprivate%2Fuds%2Fcontroller --jq .visibility 2>"$visibility_error"); then
      [ "$visibility" = private ] || { echo 'Refusing to publish unicorn into a non-private package' >&2; exit 1; }
    elif ! grep -q '(HTTP 404)' "$visibility_error"; then
      cat "$visibility_error" >&2
      exit 1
    fi
    # GHCR creates a newly published package as private. Existing packages must
    # already be private; do not change organization visibility or access here.
  fi
  docker push "$image"
  if [ "$flavor" = unicorn ]; then
    test "$(gh api orgs/defenseunicorns/packages/container/packages%2Fprivate%2Fuds%2Fcontroller --jq .visibility)" = private
  fi
  digest=$(uds zarf tools registry digest "$image")
  immutable="${image%:*}@$digest"
  cosign sign --yes "$immutable"
  cosign attest --yes --type spdxjson --predicate "$output/sbom.spdx.json" "$immutable"
fi
echo "$image"
