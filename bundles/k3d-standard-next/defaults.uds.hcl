# Copyright 2026 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

variables = {
  pepr_watcher_memory_request   = "256Mi"
  pepr_admission_memory_request = "256Mi"
  pepr_watcher_cpu_request      = "200m"
  pepr_admission_cpu_request    = "200m"

  authservice_redis_uri     = ""
  authservice_replica_count = "1"

  ca_bundle_certs                 = ""
  ca_bundle_include_dod_certs     = "false"
  ca_bundle_include_public_certs  = "false"

  domain       = "uds.dev"
  admin_domain = "admin.uds.dev"

  falco_sandbox_rules_enabled        = "true"
  falco_incubating_rules_enabled     = "true"

  loki_write_replicas   = "1"
  loki_read_replicas    = "1"
  loki_backend_replicas = "1"

  classification_banners = [
    {
      text      = "SAMPLE BANNER"
      addFooter = true
      enabledHosts = [
        "sso.uds.dev",
        "portal.uds.dev",
        "grafana.admin.uds.dev",
      ]
    }
  ]

  velero_bucket_provider_url    = "http://minio.uds-dev-stack.svc.cluster.local:9000"
  velero_bucket                 = "uds"
  velero_bucket_region          = "uds-dev-stack"
  velero_bucket_key             = "uds"
  velero_bucket_key_secret      = "uds-secret"
  velero_bucket_credential_name = "velero-bucket-credentials"
  velero_bucket_credential_key  = "cloud"

  keycloak_custom_terms_and_conditions = ""
}
