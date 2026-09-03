# Copyright 2026 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

uds {
  bundle_api_version = "uds.dev/v1alpha1"
}

locals {
  # x-release-please-start-version
  version = "1.11.0"
  # x-release-please-end
}

metadata {
  name        = "k3d-core-demo-next"
  description = "A UDS CLI Next bundle for deploying UDS Core functional layers on a development cluster"
  version     = local.version
}

package "uds_k3d_dev" {
  source = "oci://ghcr.io/defenseunicorns/packages/uds-k3d:0.20.2-airgap"
  signature_verification { verify = false }
}

package "init" {
  source = "oci://ghcr.io/zarf-dev/packages/init:v0.83.0"
  signature_verification {
    keyless {
      certificate_identity_regexp = "https://github\\.com/zarf-dev/zarf/\\.github/workflows/release\\.yml@refs/tags/v\\d+\\.\\d+\\.\\d+"
      certificate_oidc_issuer      = "https://token.actions.githubusercontent.com"
    }
  }
  depends_on = [package.uds_k3d_dev]
}

package "core_crds" {
  source = "../../build/zarf-package-core-crds-${sys.arch}-${local.version}.tar.zst"
  signature_verification { verify = false }
  depends_on = [package.init]
}

package "core_base" {
  source = "../../build/zarf-package-core-base-${sys.arch}-${local.version}.tar.zst"
  signature_verification { verify = false }
  depends_on = [package.core_crds]
  optional_components = [
    "istio-passthrough-gateway",
    "istio-egress-gateway",
    "envoy-gateway",
    "envoy-default-gateway",
  ]
  values_files = ["values/core-base.yaml"]
}

package "core_identity_authorization" {
  source = "../../build/zarf-package-core-identity-authorization-${sys.arch}-${local.version}.tar.zst"
  signature_verification { verify = false }
  depends_on   = [package.core_base]
  values_files = ["values/core-identity-authorization.yaml"]
}

package "core_logging" {
  source = "../../build/zarf-package-core-logging-${sys.arch}-${local.version}.tar.zst"
  signature_verification { verify = false }
  depends_on   = [package.core_base]
  values_files = ["values/core-logging.yaml"]
}

package "core_monitoring" {
  source = "../../build/zarf-package-core-monitoring-${sys.arch}-${local.version}.tar.zst"
  signature_verification { verify = false }
  depends_on   = [package.core_identity_authorization]
  values_files = ["values/core-monitoring.yaml"]
}

package "core_runtime_security" {
  source = "../../build/zarf-package-core-runtime-security-${sys.arch}-${local.version}.tar.zst"
  signature_verification { verify = false }
  depends_on   = [package.core_base]
  values_files = ["values/core-runtime-security.yaml"]
}

package "core_backup_restore" {
  source = "../../build/zarf-package-core-backup-restore-${sys.arch}-${local.version}.tar.zst"
  signature_verification { verify = false }
  depends_on   = [package.core_base]
  values_files = ["values/core-backup-restore.yaml"]
}

package "core_portal" {
  source = "../../build/zarf-package-core-portal-${sys.arch}-${local.version}.tar.zst"
  signature_verification { verify = false }
  depends_on = [package.core_identity_authorization]
}

package "core_metrics_server" {
  source = "../../build/zarf-package-core-metrics-server-${sys.arch}-${local.version}.tar.zst"
  signature_verification { verify = false }
  depends_on = [package.core_base]
}
