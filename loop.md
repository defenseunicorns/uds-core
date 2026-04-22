# AKS Local CI Loop

## One-time per session

```bash
az login  # select product-ci, d2871ff2-...

export ARM_SUBSCRIPTION_ID="d2871ff2-68be-4a12-8650-724d70b3b833"
export ARM_STORAGE_USE_AZUREAD=true
export UDS_RESOURCE_GROUP_NAME=shared-tf-state
export UDS_STORAGE_ACCOUNT_NAME=saproductcitfstate
export UDS_CONTAINER_NAME=terraform-state
export UDS_STATE_KEY="uds-core/${USER}-dev-aks-core.tfstate"
export UDS_CLUSTER_NAME="uds-dev-${USER}"
export TF_VAR_cluster_name="uds-dev-${USER}"
export TF_VAR_resource_group_name="uds-dev-${USER}"
export TF_VAR_location=centralus
```

## Full loop (repeat after code changes)

```bash
# 1. Build package + bundle (can run before infra is up)
unset UDS_CONFIG
PEPR_CUSTOM_IMAGE=ghcr.io/mjnagel/pepr-dev:kfc-tune \
  ZARF_ARCHITECTURE=amd64 uds run -f tasks/create.yaml standard-package \
  --no-progress --with create_options="--skip-sbom" --set FLAVOR=unicorn
uds create .github/bundles/aks -a amd64 --confirm

# 2. Deploy infra + wait for cluster
uds run -f tasks/iac.yaml apply-tofu --no-progress --set K8S_DISTRO=aks --set CLOUD=azure
uds run -f tasks/utils.yaml aks-coredns-setup --no-progress
uds run -f tasks/iac.yaml aks-cluster-ready --no-progress

# 3. Deploy UDS Core
export UDS_CONFIG=".github/bundles/aks/uds-config.yaml"
uds deploy .github/bundles/aks/uds-bundle-uds-core-aks-nightly-*.tar.zst -a amd64 --confirm

# 4. Test (will prompt for sudo password for /etc/hosts)
uds run -f tasks/test.yaml uds-core-non-k3d --set EXCLUDED_PACKAGES="metrics-server"

# 5. /etc/hosts cleanup after tests
sudo sed -i '/uds\.dev/d' /etc/hosts

# 6. Remove core + destroy infra
set +e
for i in $(seq 0 2); do
  uds remove .github/bundles/aks/uds-bundle-uds-core-aks-nightly-*.tar.zst -a amd64 --confirm && break
done
set -e
uds run -f tasks/iac.yaml destroy-iac --no-progress --set K8S_DISTRO=aks --set CLOUD=azure
```

## Notes

- `unset UDS_CONFIG` before package creation avoids stale config contaminating the build
- `/etc/hosts` cleanup after every test run prevents stale IPs from previous deployments
- `PEPR_CUSTOM_IMAGE` is set only for package creation, matching CI behavior
