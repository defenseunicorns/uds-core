# Copyright 2026 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

variables = {
  PEPR_WATCHER_MEMORY_REQUEST   = "256Mi"
  PEPR_ADMISSION_MEMORY_REQUEST = "256Mi"
  PEPR_WATCHER_CPU_REQUEST      = "200m"
  PEPR_ADMISSION_CPU_REQUEST    = "200m"

  AUTHSERVICE_REDIS_URI     = ""
  AUTHSERVICE_REPLICA_COUNT = "1"

  CA_BUNDLE_CERTS                 = ""
  CA_BUNDLE_INCLUDE_DOD_CERTS     = "false"
  CA_BUNDLE_INCLUDE_PUBLIC_CERTS  = "false"

  DOMAIN       = "uds.dev"
  ADMIN_DOMAIN = "admin.uds.dev"

  FALCO_SANDBOX_RULES_ENABLED        = "true"
  FALCO_INCUBATING_RULES_ENABLED     = "true"

  LOKI_WRITE_REPLICAS   = "1"
  LOKI_READ_REPLICAS    = "1"
  LOKI_BACKEND_REPLICAS = "1"

  CLASSIFICATION_BANNERS = [
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

  VELERO_BUCKET_PROVIDER_URL    = "http://minio.uds-dev-stack.svc.cluster.local:9000"
  VELERO_BUCKET                 = "uds"
  VELERO_BUCKET_REGION          = "uds-dev-stack"
  VELERO_BUCKET_KEY             = "uds"
  VELERO_BUCKET_KEY_SECRET      = "uds-secret"
  VELERO_BUCKET_CREDENTIAL_NAME = "velero-bucket-credentials"
  VELERO_BUCKET_CREDENTIAL_KEY  = "cloud"

  KEYCLOAK_CUSTOM_TERMS_AND_CONDITIONS = ""
}
