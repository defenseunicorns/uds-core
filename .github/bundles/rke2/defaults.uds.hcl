# Copyright 2024-2026 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

variables = {
  init = {
    registry_affinity_custom_uds = ""
    registry_pvc_access_mode     = "ReadWriteMany"
  }
  core = {
    falco_sandbox_rules_enabled    = true
    falco_incubating_rules_enabled = true
  }
}
