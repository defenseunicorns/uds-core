#!/bin/bash

# Copyright 2026 Defense Unicorns
# SPDX-License-Identifier: LicenseRef-Defense-Unicorns-Commercial

set -o errexit
set -o nounset
set -o pipefail

SCRIPT_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "${SCRIPT_ROOT}"
export GOWORK=off
if [[ -z "${CODEGEN_PKG:-}" ]]; then
  go mod download k8s.io/code-generator
  CODEGEN_PKG=$(go list -m -f '{{.Dir}}' k8s.io/code-generator)
fi

source "${CODEGEN_PKG}/kube_codegen.sh"

kube::codegen::gen_helpers \
    --boilerplate "${SCRIPT_ROOT}/hack/boilerplate.go.txt" \
    "${SCRIPT_ROOT}/api"

kube::codegen::gen_client \
    --with-watch \
    --with-applyconfig \
    --applyconfig-name "applyconfigurations" \
    --output-dir "${SCRIPT_ROOT}/client" \
    --output-pkg "github.com/defenseunicorns/uds-core/src/go-controller/client" \
    --plural-exceptions "ClusterConfig:ClusterConfig" \
    --boilerplate "${SCRIPT_ROOT}/hack/boilerplate.go.txt" \
    "${SCRIPT_ROOT}/api"
