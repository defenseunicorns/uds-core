# pip install json-schema-for-humans

mkdir -p crd-docs/generated
npx kubernetes-fluent-client crd exemptions.uds.dev -l schema crd-docs/schemas
npx kubernetes-fluent-client crd packages.uds.dev -l schema crd-docs/schemas
for file in crd-docs/schemas/*.schema; do
  sed -i '/"additionalProperties": {}/d' "$file"
  mv "$file" "${file%-v1alpha1.schema}.json"
done

# generate-schema-doc --config-file crd-docs/config.yaml crd-docs/schemas crd-docs/generated
