# Copyright 2026 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

variables = {
  INSECURE_ADMIN_PASSWORD_GENERATION = "true"

  CLASSIFICATION_BANNERS = [
    {
      text = "SAMPLE BANNER"
      enabledHosts = [
        "sso.uds.dev",
      ]
      pathPrefixes = [
        "/realms/uds/account",
      ]
    },
    {
      text       = "UNKNOWN"
      addFooter  = false
      enabledHosts = [
        "grafana.admin.uds.dev",
      ]
    },
    {
      text = "UNCLASSIFIED"
      enabledHosts = [
        "portal.uds.dev",
      ]
    },
  ]

  # Passed through as a scalar Zarf package variable to uds_k3d_dev.
  K3D_EXTRA_ARGS = "--servers 3 --agents 2"
}
