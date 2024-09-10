#zarf package deploy oci://defenseunicorns/uds-k3d:0.8.0 --set=K3D_IMAGE=rancher/k3s:v1.29.6-k3s1 --confirm --no-progress
#export PEPR_MODE=dev; npx ts-node -e "import { registerCRDs } from './src/pepr/operator/crd/register'; registerCRDs()"

# pip install json-schema-for-humans

mkdir -p crd-docs/generated-js
mkdir -p crd-docs/generated-md
npx kubernetes-fluent-client crd exemptions.uds.dev -l schema crd-docs/schemas
npx kubernetes-fluent-client crd packages.uds.dev -l schema crd-docs/schemas
for file in crd-docs/schemas/*.schema; do
  sed -i '/"additionalProperties": {}/d' "$file"
  mv "$file" "${file%-v1alpha1.schema}.json"
done

# JS
# generate-schema-doc --config-file crd-docs/config.yaml crd-docs/schemas crd-docs/generated-js
# 

# MD
# generate-schema-doc --config-file crd-docs/md-config.yaml crd-docs/schemas crd-docs/generated-md
# sed -i 's/<a name="[^"]*"><\/a>//g' crd-docs/generated-md/*

# add the top section for uds-docs

#---
#title: (Package or Exemption) CRD
#weight: 3
#---

