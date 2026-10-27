# Copyright 2026 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

variables = {
  insecure_admin_password_generation = "true"
  falco_cri_socket = "/run/k0s/containerd.sock"

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
      enabledHosts = [
        "portal.uds.dev",
      ]
    },
  ]
}
