# Copyright 2026 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

variables = {
  uds_controller_replicas = "2"
  uds_controller_memory_request = "256Mi"
  uds_controller_cpu_request = "200m"

  istiod_memory_request = "1024Mi"
  istiod_cpu_request    = "100m"
  proxy_memory_request  = "40Mi"
  proxy_memory_limit    = "1024Mi"
  proxy_cpu_request     = "10m"
  proxy_cpu_limit       = "2000m"

  authservice_replica_count = "1"

  keycloak_memory_request          = "700Mi"
  keycloak_cpu_request             = "100m"
  keycloak_memory_limit            = "2Gi"
  keycloak_cpu_limit               = "2"
  keycloak_waypoint_hpa_enabled    = "false"
  keycloak_waypoint_cpu_request    = "100m"
  keycloak_waypoint_memory_request = "64Mi"

  minio_buckets  = []
  minio_svcaccts = []
  minio_users    = []
  minio_policies = []
}
