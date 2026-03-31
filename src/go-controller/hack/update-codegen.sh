#!/bin/bash

# Copyright 2026 Defense Unicorns
# SPDX-License-Identifier: LicenseRef-Defense-Unicorns-Commercial

set -o errexit
set -o nounset
set -o pipefail

SCRIPT_ROOT=$(dirname "${BASH_SOURCE[0]}")/..
CODEGEN_PKG=${CODEGEN_PKG:-$(cd "${SCRIPT_ROOT}"; ls -d -1 ./vendor/k8s.io/code-generator 2>/dev/null || echo ../code-generator)}

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
    --boilerplate "${SCRIPT_ROOT}/hack/boilerplate.go.txt" \
    "${SCRIPT_ROOT}/api"
