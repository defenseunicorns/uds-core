# Copyright 2024 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

resource "local_sensitive_file" "uds_config" {
  filename = "../../../bundles/rke2/uds-config.yaml"
  content = yamlencode({
    "options" : {
      "architecture" : "amd64"
    },
    "variables" : {
      "core" : {
        "loki_chunks_bucket" : module.storage.s3_buckets["loki"].bucket_name
        "loki_ruler_bucket" : module.storage.s3_buckets["loki"].bucket_name,
        "loki_admin_bucket" : module.storage.s3_buckets["loki"].bucket_name,
        "loki_s3_region" : data.aws_region.current.name,
        "loki_irsa_role_arn" : module.storage.irsa["loki"].bucket_role.arn
        "velero_use_secret" : false,
        "velero_irsa_role_arn" : module.storage.irsa["velero"].bucket_role.arn,
        "velero_bucket" : module.storage.s3_buckets["velero"].bucket_name,
        "velero_bucket_region" : data.aws_region.current.name,
        "velero_bucket_provider_url" : ""
        "velero_bucket_credential_name" : "",
        "velero_bucket_credential_key" : "",
        "grafana_ha" : false,
        "grafana_pg_host" : "\"\"",
        "grafana_pg_port" : "\"\"",
        "grafana_pg_database" : "\"\"",
        "grafana_pg_password" : "\"\"",
        "grafana_pg_user" : "\"\"",
      }
      "init" : {
        # Disabled to prevent scaling timing issues with image pushes
        "registry_hpa_enable" : false
      }
    }
  })
}
