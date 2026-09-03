# Copyright 2026 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

variables = {
  CLASSIFICATION_BANNERS = [
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

  AUTHSERVICE_REDIS_URI     = "redis://authservice:authservice@host.k3d.internal:6379"
  AUTHSERVICE_REPLICA_COUNT = "2"

  FALCO_SANDBOX_RULES_ENABLED    = "true"
  FALCO_INCUBATING_RULES_ENABLED = "true"

  GRAFANA_HA          = "true"
  GRAFANA_PG_HOST     = "host.k3d.internal"
  GRAFANA_PG_PORT     = "5432"
  GRAFANA_PG_DATABASE = "grafana"
  GRAFANA_PG_PASSWORD = "unicorn123!@#UN"
  GRAFANA_PG_USER     = "postgres"
  GRAFANA_PG_SSL_MODE = "disable"

  LOKI_BACKEND_REPLICAS = "3"
  LOKI_READ_REPLICAS    = "3"
  LOKI_WRITE_REPLICAS   = "3"

  KEYCLOAK_HA          = "true"
  KEYCLOAK_PG_USERNAME = "postgres"
  KEYCLOAK_PG_PASSWORD = "unicorn123!@#UN"
  KEYCLOAK_PG_DATABASE = "keycloak"
  KEYCLOAK_PG_HOST     = "host.k3d.internal"
  KEYCLOAK_DEVMODE     = "false"
}
