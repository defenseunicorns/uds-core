---
title: Keycloak Airgap CRLs
---

## Overview

In connected environments, Keycloak can use **OCSP (Online Certificate Status Protocol)** to check whether a client certificate has been revoked. In a true air-gap, OCSP responders are unreachable, so you must either:

* disable revocation checks (not recommended), or
* rely on **CRLs (Certificate Revocation Lists)** that you download *before* entering the air-gap and load locally into Keycloak.

This guide documents a repeatable workflow to:

1. Collect one or more CRL files (`*.crl`).
2. Package them as a small OCI **data image** and wrap that into a **Zarf package**.
3. Deploy that Zarf package **before** Keycloak.
4. Mount the OCI data image into the Keycloak pod via **Kubernetes ImageVolume**.
5. Configure Keycloak’s X.509 authenticator to read CRLs from the generated CRL path list.

You do **not** need to build a custom Keycloak image.

---

## Use the script (recommended path)

The intent of this workflow is that **users run one script** to fetch (or accept) a CRL bundle, filter it, build an OCI “data image”, and emit everything you need to wire Keycloak up.

### What the script does

When you run `create-keycloak-crl-oci-volume-package.sh`, it will:

1. **Acquire CRLs as a ZIP**
   * If you provide `--crl-zip <path>`, it uses that ZIP.
   * Otherwise it **downloads the DoD “ALL CRL ZIP”** from DISA.

2. **Extract and filter CRL files**
   * Unzips and finds all `*.crl`.
   * By default it **excludes** CRLs whose filenames start with:
     * `DODEMAIL*` (email) and
     * `DODSW*` (software)
   * You can include them with flags (below).

3. **Stage the CRLs into an OCI data image**
   * Copies the selected CRLs into a staging directory.
   * Builds a tiny OCI image (FROM `scratch`) that contains only the CRL files.

4. **Generate the Keycloak “CRL Path” string**
   * Sorts the CRL filenames.
   * Builds a single string of relative paths using `##` as the delimiter.
   * Writes it to `./keycloak-crls/keycloak-crl-paths.txt`.

5. **Create a Zarf package that delivers the image**
   * Creates a `keycloak-crls` Zarf package that contains the OCI image.
   * Writes the package to `./keycloak-crls/zarf-package-keycloak-crls-*.tar.zst`.

### Prerequisites

Run the script on a machine that has:

* `bash`, `curl`, `unzip`, `find`, `sort`
* `docker` (to build the OCI data image)
* `uds` (so the script can run `uds zarf package create`)

### Run it

From the repo root (or wherever the script lives):

```bash
bash scripts/keycloak-crl-airgap/create-keycloak-crl-oci-volume-package.sh
```

That will:

* download the DISA CRL ZIP
* filter out `DODEMAIL*` and `DODSW*`
* output:

  * `./keycloak-crls/keycloak-crl-paths.txt`
  * `./keycloak-crls/zarf-package-keycloak-crls-*.tar.zst`

### Common options

#### Use a pre-downloaded ZIP (recommended when preparing an air-gap transfer)

```bash
bash scripts/keycloak-crl-airgap/create-keycloak-crl-oci-volume-package.sh \
  --crl-zip /path/to/crls.zip
```

This is the usual flow when you:
1. download the ZIP on a connected machine,
2. move it into the air-gap (or a build system inside the enclave), then
3. run the script locally to produce the package.

#### Include DoD Email CRLs

```bash
bash scripts/keycloak-crl-airgap/create-keycloak-crl-oci-volume-package.sh --include-email
```

#### Include DoD Software CRLs

```bash
bash scripts/keycloak-crl-airgap/create-keycloak-crl-oci-volume-package.sh --include-sw
```

### Outputs

After the script finishes, you should have:

* **CRL path list (paste into Bundle Keycloak config):**
  * `./keycloak-crls/keycloak-crl-paths.txt`

* **Zarf package to add to your bundle/deploy:**
  * `./keycloak-crls/zarf-package-keycloak-crls-*.tar.zst`

## Configure your UDS bundle

Before deploying, configure your bundle to:
1. deploy the CRL package before Keycloak
2. mount the CRL data image via ImageVolume
3. configure Keycloak X.509 settings to use the generated CRL Path
4. add policy exemptions if needed

### Add Keycloak CRL configuration to bundle

Add the following to your bundle’s Keycloak values:

```yaml
keycloak:
  keycloak:
    values:
      - path: realmInitEnv
        value:
          X509_OCSP_FAIL_OPEN: "false"
          X509_OCSP_CHECKING_ENABLED: "false"
          X509_CRL_CHECKING_ENABLED: "true"
          X509_CRL_ABORT_IF_NON_UPDATED: "false"
          X509_CRL_RELATIVE_PATH: "<paste keycloak-crl-paths.txt contents here>"
      - path: extraVolumes
        value:
          - name: ca-certs
            configMap:
              name: uds-trust-bundle
              optional: true
          - name: keycloak-crls
            image:
              reference: 127.0.0.1:31999/library/keycloak-crls:local # Common Zarf registry address; adjust for your environment
              pullPolicy: Always
      - path: extraVolumeMounts
        value:
          - name: ca-certs
            mountPath: /tmp/ca-certs
            readOnly: true
          - mountPath: /tmp/keycloak-crls
            name: keycloak-crls
            readOnly: true
```

:::note
`realmInitEnv` values are applied during realm initialization/import. If you change these values after initial deployment, you may need to redeploy Keycloak (and in some cases re-import/recreate the realm) for the changes to take effect.
:::

:::caution
Using the `X509_CRL_ABORT_IF_NON_UPDATED` to false means that if the CRL cannot be updated, the connection will be allowed. This is useful for air-gapped environments where the CRL may not be available. If it's set to true, the connection will be denied if the CRL cannot be updated on time.
:::

### Add CRL package to bundle (deployment order)

Make sure the CRL package deploys **before** Keycloak.

```yaml
packages:
  - name: core-base
    ref: x.x.x
  - name: keycloak-crls
    path: ./keycloak-crls/zarf-package-keycloak-crls-<arch>-<tag>.tar.zst
    ref: x.x.x
  - name: core-identity-authorization
    ref: x.x.x
```

### Configure UDS policy exemptions (if required)

If ImageVolume is denied by policy, add an exemption targeting Keycloak pods:

```yaml
uds-exemptions:
  uds-exemptions:
    values:
      - path: exemptions.custom
        value:
          - name: keycloak-imagevolume-exemption
            exemptions:
              - policies:
                  - RestrictVolumeTypes
                matcher:
                  namespace: keycloak
                  name: "^keycloak-.*"
                  kind: pod
                title: "Allow Keycloak ImageVolume for CRLs"
                description: "Allow Keycloak pods to mount CRLs via Kubernetes ImageVolume (OCI-backed)."
```

### Configure ImageVolume feature gates (k3s/k3d only)

If using k3s/k3d on a Kubernetes version that requires explicit enablement, create a `uds-config.yaml`:

```yaml
variables:
  uds-k3d-dev:
    k3d_extra_args: >-
      --k3s-arg --kube-apiserver-arg=feature-gates=ImageVolume=true@server:0
      --k3s-arg --kubelet-arg=feature-gates=ImageVolume=true@server:0
```

---

## Deploy UDS Core with CRL support

Deploy the fully configured bundle.

```bash
# For Slim Dev Bundle
UDS_CONFIG=bundles/k3d-slim-dev/uds-config.yaml uds deploy bundles/k3d-slim-dev/uds-bundle-k3d-core-slim-dev-amd64-*.tar.zst --confirm --no-progress
```
---

## Verify

### Verify CRL package deployment

```bash
uds zarf package list | grep keycloak-crls
```

### Verify CRLs are mounted in Keycloak

```bash
kubectl exec -n keycloak keycloak-0 -c keycloak -- ls -la /tmp/keycloak-crls
```

### Verify Keycloak CRL configuration

Confirm the realm’s X.509 configuration uses the CRL Path value you generated (the contents of `keycloak-crl-paths.txt`).

### Test X.509 authentication

Use your normal mTLS/browser client cert flow and confirm Keycloak validates certificates without CRL-related errors.

---

## CRL renewal and maintenance

CRLs have an expiry window (driven by `nextUpdate`). Treat refresh as an operational requirement:

1. Re-download all CRLs on a connected machine.
2. Validate `nextUpdate` is in the future.
3. Rebuild and redeploy the CRL Zarf package.
4. Restart Keycloak if needed to ensure caches are refreshed.

---

## Troubleshooting

### "Volume has a disallowed volume type of 'image'"

Your UDS exemption was not applied (or did not match). Verify:

* The exemption is included in your bundle and deployed
* It targets the right namespace (`keycloak`) and pod matcher (`^keycloak-.*`)

### "Failed to pull image … not found"

The CRL image is missing or the reference is wrong. Verify:

* CRL package is deployed before Keycloak
* `extraVolumes.image.reference` matches the image reference available in the cluster registry

### Keycloak logs: "Unable to load CRL from …"

Verify:

* CRL files exist in the container at `/tmp/keycloak-crls`
* `X509_CRL_RELATIVE_PATH` exactly matches `keycloak-crl-paths.txt`
* CRLs are not expired (`nextUpdate` still in the future)
