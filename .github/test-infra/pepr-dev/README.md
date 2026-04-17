# Dev Pepr build

Temporary harness for testing in-flight Pepr changes against UDS Core CI without publishing a Pepr release. Intended to be short-lived — remove before the branch merges.

## What it wires up

| Piece | File |
| --- | --- |
| Pepr npm tarball (CLI + lib used at `pepr build` time) | `pepr.tgz` in this directory |
| `pepr` dependency pointer | `package.json` → `"pepr": "file:.github/test-infra/pepr-dev/pepr.tgz"` |
| Pepr controller image override (runtime admission/watcher pods) | `PEPR_CUSTOM_IMAGE` env on the "Create UDS Core Package" step in `.github/workflows/test-aks.yaml` |

The `PEPR_CUSTOM_IMAGE` env in `tasks/create.yaml` short-circuits the flavor defaults — all three flavors (upstream, registry1, unicorn) use the dev image when it's set.

## Refreshing the tarball + image

Run from the Pepr checkout (`../pepr` relative to `uds-core`):

```bash
# 1. Build the npm tarball
cd ../pepr
git checkout webhook-fixes # or your branch
npm ci
npm run build
# Output: pepr-0.0.0-development.tgz

# 2. Drop it into uds-core and reinstall
cp pepr-0.0.0-development.tgz ../uds-core/.github/test-infra/pepr-dev/pepr.tgz
cd ../uds-core
npm install   # refreshes package-lock.json against the new tarball

# 3. Build the controller image (linux/amd64 for AKS nodes)
cd ../pepr
docker buildx build --platform linux/amd64 --tag pepr:dev-keepalive --load .

# 4. Tag + push to a registry the CI runner can pull from
docker tag pepr:dev-keepalive ghcr.io/somewhere/pepr-dev:keepalive
docker push ghcr.io/somewhere/pepr-dev:keepalive
# Make the GHCR package public so zarf bundle create can pull without extra auth.

# 5. Update PEPR_CUSTOM_IMAGE in .github/workflows/test-aks.yaml to match the pushed tag.
```
