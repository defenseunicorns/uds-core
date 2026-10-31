# Copyright 2024-2026 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

variables = {
  # Keep layer maps present; required IaC values must come from config.uds.hcl.
  core_base                   = {}
  core_identity_authorization = {}
  core_logging                = {}
  core_monitoring = {
    grafana_ha = true
  }
  core_runtime_security = {
    falco_sandbox_rules_enabled    = true
    falco_incubating_rules_enabled = true
  }
  core_backup_restore = {
    velero_client_secret_env_var      = "AZURE_STORAGE_ACCOUNT_ACCESS_KEY"
    velero_backup_storage_config_name = "default"
    velero_storage_provider           = "azure"
  }
}
