#!/bin/sh
# Copyright 2026 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
set -eu
umask 077
cd "$(dirname "$0")/../../.."
export GOWORK=off GOTOOLCHAIN=local
validation_dir=$(mktemp -d)
trap 'rm -rf "$validation_dir"' EXIT
python3 src/go-controller/native-admission/render.py
uds zarf tools helm template uds-controller src/go-controller/chart   --namespace uds-system --kube-version 1.36.1   --api-versions admissionregistration.k8s.io/v1/MutatingAdmissionPolicy   --set nativeAdmission.narrowCallbacks=false > "$validation_dir/chart.yaml"
node src/go-controller/native-admission/sync-manifests.mjs "$validation_dir/chart.yaml"
go -C src/go-controller build -o "$validation_dir/core-transition" ./cmd/core-transition
"$validation_dir/core-transition" --zarf "$(command -v uds)" --uds --phase contract   --chart src/go-controller/chart --contract src/go-controller/native-admission/admission-contract.json
