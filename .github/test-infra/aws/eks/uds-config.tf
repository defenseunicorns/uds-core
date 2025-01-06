# Copyright 2024 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

resource "local_sensitive_file" "uds_config" {
  filename = "../../../bundles/eks/uds-config.yaml"
  content = yamlencode({
    "options" : {
      "architecture" : "amd64"
    },
    "variables" : {
      "core" : {
        "loki_chunks_bucket" : module.S3["loki"].bucket_name
        "loki_ruler_bucket" : module.S3["loki"].bucket_name,
        "loki_admin_bucket" : module.S3["loki"].bucket_name,
        "loki_s3_region" : data.aws_region.current.name,
        "loki_irsa_role_arn" : module.irsa["loki"].role_arn,
        "velero_use_secret" : false,
        "velero_irsa_role_arn" : module.irsa["velero"].role_arn,
        "velero_bucket" : module.S3["velero"].bucket_name,
        "velero_bucket_region" : data.aws_region.current.name,
        "velero_bucket_provider_url" : "",
        "velero_bucket_credential_name" : "",
        "velero_bucket_credential_key" : "",
        "grafana_ha" : true,
        "grafana_pg_host" : element(split(":", module.db.db_instance_endpoint), 0),
        "grafana_pg_port" : var.db_port,
        "grafana_pg_database" : var.db_name,
        "grafana_pg_password" : random_password.db_password.result,
        "grafana_pg_user" : var.username
      }
    }
  })
}
