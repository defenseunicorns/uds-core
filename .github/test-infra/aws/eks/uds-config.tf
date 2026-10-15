# Copyright 2024-2026 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

resource "local_sensitive_file" "uds_config" {
  filename = "../../../bundles/eks/config.uds.hcl"
  content  = <<-EOT
    options {
      architecture = "amd64"
    }

    variables = {
      # Workaround for Bottlerocket EBS issue - https://github.com/bottlerocket-os/bottlerocket/issues/2417
      registry_hpa_enable = false

      velero_bucket                 = ${jsonencode(module.S3["velero"].bucket_name)}
      velero_bucket_region          = ${jsonencode(data.aws_region.current.region)}
      velero_bucket_provider_url    = ""
      velero_bucket_credential_name = ""
      velero_bucket_credential_key  = ""

      core = {
        loki_chunks_bucket = ${jsonencode(module.S3["loki"].bucket_name)}
        loki_admin_bucket  = ${jsonencode(module.S3["loki"].bucket_name)}
        loki_s3_region     = ${jsonencode(data.aws_region.current.region)}
        loki_irsa_role_arn = ${jsonencode(module.irsa["loki"].role_arn)}

        velero_use_secret   = false
        velero_irsa_role_arn = ${jsonencode(module.irsa["velero"].role_arn)}

        grafana_ha          = true
        grafana_pg_host     = ${jsonencode(element(split(":", module.dbs["grafana"].db_instance_endpoint), 0))}
        grafana_pg_port     = ${jsonencode(var.databases["grafana"].port)}
        grafana_pg_database = ${jsonencode(var.databases["grafana"].name)}
        grafana_pg_password = ${jsonencode(random_password.db_passwords["grafana"].result)}
        grafana_pg_user     = ${jsonencode(var.databases["grafana"].username)}

        keycloak_db_host     = ${jsonencode(element(split(":", module.dbs["keycloak"].db_instance_endpoint), 0))}
        keycloak_db_username = ${jsonencode(var.databases["keycloak"].username)}
        keycloak_db_database = ${jsonencode(var.databases["keycloak"].name)}
        keycloak_db_password = ${jsonencode(random_password.db_passwords["keycloak"].result)}
      }
    }
  EOT
}
