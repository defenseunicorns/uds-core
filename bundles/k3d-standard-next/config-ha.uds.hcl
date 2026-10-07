# Copyright 2026 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

variables = {
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

  authservice_redis_uri     = "redis://authservice:authservice@host.k3d.internal:6379"
  authservice_replica_count = "2"

  falco_sandbox_rules_enabled    = "true"
  falco_incubating_rules_enabled = "true"

  grafana_ha          = "true"
  grafana_pg_host     = "host.k3d.internal"
  grafana_pg_port     = "5432"
  grafana_pg_database = "grafana"
  grafana_pg_password = "unicorn123!@#UN"
  grafana_pg_user     = "postgres"
  grafana_pg_ssl_mode = "disable"

  loki_backend_replicas = "3"
  loki_read_replicas    = "3"
  loki_write_replicas   = "3"

  keycloak_ha          = "true"
  keycloak_pg_username = "postgres"
  keycloak_pg_password = "unicorn123!@#UN"
  keycloak_pg_database = "keycloak"
  keycloak_pg_host     = "host.k3d.internal"
  keycloak_devmode     = "false"
}
