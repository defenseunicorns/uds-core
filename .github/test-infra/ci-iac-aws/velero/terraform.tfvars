region        = "###ZARF_VAR_REGION###"
name          = "###ZARF_VAR_CLUSTER_NAME###"
bucket_name   = "###ZARF_VAR_CLUSTER_NAME###-velero"
force_destroy = "###ZARF_VAR_VELERO_FORCE_DESTROY###"

kubernetes_service_account = "velero-server"
kubernetes_namespace       = "velero"

permissions_boundary_name = "###ZARF_VAR_PERMISSIONS_BOUNDARY_NAME###"
use_permissions_boundary  = "###ZARF_VAR_USE_PERMISSIONS_BOUNDARY###"
