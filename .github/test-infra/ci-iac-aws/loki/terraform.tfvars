region        = "###ZARF_VAR_REGION###"
name          = "###ZARF_VAR_CLUSTER_NAME###"
bucket_name   = "###ZARF_VAR_CLUSTER_NAME###-loki"
force_destroy = "###ZARF_VAR_LOKI_FORCE_DESTROY###"

kubernetes_service_account = "logging-loki"
kubernetes_namespace       = "logging"

permissions_boundary_name = "###ZARF_VAR_PERMISSIONS_BOUNDARY_NAME###"
use_permissions_boundary  = "###ZARF_VAR_USE_PERMISSIONS_BOUNDARY###"
