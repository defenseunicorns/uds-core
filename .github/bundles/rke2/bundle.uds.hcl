# Copyright 2024-2026 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

uds {
  bundle_api_version = "uds.dev/v1alpha1"
}

locals {
  # x-release-please-start-version
  version = "1.14.0"
  # x-release-please-end
}

metadata {
  name        = "uds-core-rke2-nightly"
  description = "A UDS bundle for deploying RKE2 and UDS Core"
  version     = local.version
}

package "pod-identity-webhook" {
  source = "oci://ghcr.io/defenseunicorns/packages/uds/pod-identity-webhook:0.3.1-upstream"

  signature_verification {
    verify = false
  }
}

package "init" {
  source     = "oci://ghcr.io/zarf-dev/packages/init:v0.87.0"
  depends_on = [package.pod-identity-webhook]

  signature_verification {
    keyless {
      certificate_identity_regexp = "https://github\\.com/zarf-dev/zarf/\\.github/workflows/release\\.yml@refs/tags/v\\d+\\.\\d+\\.\\d+"
      certificate_oidc_issuer     = "https://token.actions.githubusercontent.com"
    }
  }

  values_files = ["values/init.yaml"]
}

package "core" {
  source     = "../../../build/zarf-package-core-${sys.arch}-${local.version}.tar.zst"
  depends_on = [package.init]

  signature_verification {
    verify = false
  }

  optional_components = [
    "metrics-server",
    "istio-egress-gateway",
    "envoy-gateway",
    "envoy-default-gateway",
  ]
  values_files = ["values/core.yaml"]
}
