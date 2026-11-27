# Copyright 2026 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

variables = {
  # Use embedded etcd to avoid Kine's fatal SQLite compaction failures under load.
  k3d_extra_args = "--k3s-arg=--cluster-init@server:0"

  classification_banners = [
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
      cssOnly = true
      enabledHosts = [
        "portal.uds.dev",
      ]
    },
  ]

  # Mirrors bundles/k3d-standard/uds-upgrade-test-config.yaml for upgrade runs.
  loki_backend_replicas = "3"
}
