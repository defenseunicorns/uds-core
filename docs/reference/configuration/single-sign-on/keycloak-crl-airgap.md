---
title: Airgap CRL Configuration for Keycloak X.509 Authentication
---

# Airgap CRL Configuration for Keycloak X.509 Authentication

## Overview

By default, Keycloak uses **OCSP (Online Certificate Status Protocol)** to check whether an X.509 certificate (like a DoD CAC) has been revoked. In an airgapped environment, Keycloak cannot reach the external OCSP responder URLs embedded in those certificates, which causes authentication failures or forces accepting the security risk of `X509_OCSP_FAIL_OPEN`.

The preferred alternative is **Certificate Revocation Lists (CRLs)**: signed, offline-capable snapshots published by the issuing CA that enumerate all revoked certificates for that CA. CRLs can be downloaded before entering the airgap, packaged, and loaded directly into Keycloak's filesystem. Keycloak then performs revocation checking against these local files instead of reaching out to an external server.

This guide covers the complete process: identifying what CRLs you need, downloading them, packaging them for airgap transport, mounting them into the Keycloak pod, and configuring the x509 authenticator to use them.

:::note[No custom Keycloak image required]
This procedure is implemented via:

- Delivering CRL file(s) to the cluster (for example as a Kubernetes Secret)
- Mounting them into the Keycloak pod via a UDS bundle override
- Configuring the **UDS realm** in the Keycloak Admin Console

You do not need to rebuild or customize the `uds-identity-config` image to use CRLs in an airgapped environment.
:::

---

## Quick Start

1. Get the correct DoD CRL(s) for the certificate chain(s) you expect to see.
2. Deliver those CRLs to the cluster (for example as a Kubernetes Secret).
3. Mount them into the Keycloak pod (recommended: `/opt/keycloak/data/crls`).
4. In the Keycloak Admin Console:
   1. Select the **`uds`** realm
   2. Go to **Authentication**
   3. Open the **`UDS Authentication`** flow
   4. Find **`X509/Validate Username Form`** and click the **⚙️ gear**
   5. Set:
      1. **Check certificate validity:** enabled
      2. **CRL Checking Enabled:** enabled
      3. **CRL abort if non updated:** enabled
      4. **OCSP Checking Enabled:** disabled
      5. **OCSP Fail-Open Behavior:** disabled
      6. **Enable CRL Distribution Point:** disabled
      7. **CRL Path:** set a path relative to `/opt/keycloak/conf` (semicolon-separated). For CRLs mounted at `/opt/keycloak/data/crls`, use `../data/crls/<filename>`.

The rest of this guide provides the detailed “how” for each step.

---

## Background: OCSP vs. CRL

|  | OCSP | CRL |
|---|---|---|
| **How it works** | Keycloak contacts a live OCSP responder URL embedded in the cert | Keycloak checks a local file listing all revoked cert serial numbers |
| **Requires outbound network** | Yes, at every authentication | No, after the initial download |
| **Freshness** | Real-time | Periodic (DoD CRLs: ~24 hr validity window) |
| **Airgap suitable** | No (or "fail-open" risk) | Yes |

:::note
When you configure CRL-based checking, you are accepting that revocations issued _after your last CRL download_ will not be detected until you update the CRL files. This is a deliberate operational tradeoff in airgapped environments. You must establish a process to refresh CRLs on a regular cadence. See [CRL Renewal and Maintenance](#crl-renewal-and-maintenance).
:::

---

## Prerequisites

- UDS Core deployed with Keycloak and X.509 authentication enabled
- `kubectl` access to the cluster
- Access to an internet-connected machine **before** entering the airgap
- `openssl` CLI available on the internet-connected machine
- `zarf` and `uds` CLI available
- Familiarity with the [UDS Bundle overrides](https://uds.defenseunicorns.com/reference/bundles/overrides/) pattern

:::note[UDS Core already configures optional client certs at the gateway]
UDS Core's Istio Gateways are configured with `OPTIONAL_MUTUAL` for Keycloak endpoints so a browser *can* present a client certificate.

This doc only covers making revocation checks work in an airgapped environment (CRLs vs OCSP).
:::

---

## Step 1: Identify Which CRLs You Need

Not all CRL files are equal. Keycloak needs the CRL for **every CA in the certificate chain** that will be presented. For DoD CACs, this typically means the **DoD Root CA** CRL and every **DoD Intermediate/Issuing CA** CRL that signed the specific user certificates in your environment.

### Inspect a CAC Certificate

If you have a CAC certificate in PEM format, use `openssl` to list the CRL Distribution Points embedded in each certificate in the chain:

```bash
# Extract CRL Distribution Points from a single cert
openssl x509 -in user-cert.pem -noout -text \
  | grep -A 4 "CRL Distribution Points"

# Split a full chain bundle and inspect each cert
csplit -s -z -f cert- chain.pem '/-----BEGIN CERTIFICATE-----/' '{*}'

for cert in cert-*; do
  echo "=== $(openssl x509 -in "$cert" -noout -subject) ==="
  openssl x509 -in "$cert" -noout -text \
    | grep -A 4 "CRL Distribution Points"
done
```

Example output from a DoD CAC certificate:

```
X509v3 CRL Distribution Points:
    Full Name:
      URI:http://crl.disa.mil/DODSWCA60.crl
    Full Name:
      URI:http://crl.disa.mil/DODINTERME2.crl
```

Write down every unique CRL URL from every certificate in the chain, not just the end-entity cert.

### DoD PKI CRL Sources

If you do not yet have a certificate but know you need DoD CAC support, the authoritative CRL sources are:

- **Primary:** [https://crl.disa.mil/](https://crl.disa.mil/)
- **Alternate (GDS):** [https://crl.gds.disa.mil/](https://crl.gds.disa.mil/)
- **Authoritative CA list:** [https://public.cyber.mil/pki-pke/](https://public.cyber.mil/pki-pke/)

For typical DoD CAC deployments, you will need CRLs for the DoD Root CAs (e.g., `DODROOTCA2.crl` through `DODROOTCA6.crl`) and every SW CA or ID CA that issues end-entity CAC certs in your environment (e.g., `DODSWCA60.crl`, `DODIDCA59.crl`).

:::note
When in doubt, download more CRLs than you think you need. Keycloak accepts a semicolon-separated list and will match whichever CRL corresponds to the certificate being validated. Unmatched CRL files are silently ignored; they are not an error.
:::

---

## Step 2: Download and Validate the CRLs

Perform these steps on your **internet-connected machine** before entering the airgap.

### Download

```bash
mkdir -p dod-crls

# Repeat for every CRL URL identified in Step 1
curl -sSL -o dod-crls/DODROOTCA3.crl  "http://crl.disa.mil/DODROOTCA3.crl"
curl -sSL -o dod-crls/DODSWCA60.crl   "http://crl.disa.mil/DODSWCA60.crl"
curl -sSL -o dod-crls/DODIDCA59.crl   "http://crl.disa.mil/DODIDCA59.crl"
# ... add more as needed
```

### Determine Format (DER vs. PEM)

DoD CRLs from `crl.disa.mil` are typically **DER (binary)** format. Keycloak accepts both. To verify:

```bash
# If this succeeds, the file is DER
openssl crl -in dod-crls/DODROOTCA3.crl -inform DER -noout -text 2>/dev/null \
  && echo "DER format" || echo "Possibly PEM format"

# Convert DER to PEM if desired (optional; Keycloak reads both)
openssl crl -in dod-crls/DODROOTCA3.crl -inform DER \
  -out dod-crls/DODROOTCA3.crl.pem -outform PEM
```

### Validate Expiry

Keycloak will refuse to use a CRL whose `nextUpdate` is in the past. Check all downloaded files before packaging:

```bash
for crl in dod-crls/*.crl; do
  echo "=== $crl ==="
  openssl crl -in "$crl" -inform DER -noout -text \
    | grep -E "Last Update|Next Update"
done
```

:::caution
If any `Next Update` is in the past, that CRL is expired. Download a fresh copy before continuing. Keycloak will reject an expired CRL at runtime and revocation checking will fail.
:::

---

## Step 3: Package CRLs for Airgap Transport

The CRL files need to reach the Kubernetes cluster. Package them as a Kubernetes **Secret** inside a Zarf package to transport them through your airgap pipeline alongside other images and packages.

:::note[If you are not airgapped]
For local/dev environments, you can skip Zarf packaging and apply the Secret directly:

```bash
kubectl create secret generic keycloak-crls \
  --from-file=DODROOTCA3.crl=dod-crls/DODROOTCA3.crl \
  --from-file=DODSWCA60.crl=dod-crls/DODSWCA60.crl \
  --from-file=DODIDCA59.crl=dod-crls/DODIDCA59.crl \
  --namespace keycloak \
  --dry-run=client \
  -o yaml | kubectl apply -f -
```
:::

### Create the Secret Manifest

```bash
# No cluster required; dry-run generates the YAML
kubectl create secret generic keycloak-crls \
  --from-file=DODROOTCA3.crl=dod-crls/DODROOTCA3.crl \
  --from-file=DODSWCA60.crl=dod-crls/DODSWCA60.crl \
  --from-file=DODIDCA59.crl=dod-crls/DODIDCA59.crl \
  --namespace keycloak \
  --dry-run=client \
  -o yaml > keycloak-crls-secret.yaml
```

:::note[Note on Secret size:]
Kubernetes Secrets have a 1 MiB default size limit. Base64 encoding adds ~33% overhead. If your total CRL file size approaches 700 KB, split them across multiple Secrets and multiple volume mounts. Check with `ls -lh dod-crls/`.
:::

:::note[ConfigMap alternative:]
CRL files are public information by definition, so using a ConfigMap instead of a Secret is also acceptable. Replace `secret` with `configmap` in the command above, and use `configMap:` instead of `secret:` in the volume definition in Step 4.
:::

### Create the Zarf Package

In the same directory as `keycloak-crls-secret.yaml`, create a `zarf.yaml`:

```yaml
kind: ZarfPackageConfig
metadata:
  name: keycloak-crls
  description: "DoD CRL files for Keycloak X.509 airgap revocation checking"
  version: 0.1.0

components:
  - name: keycloak-crls
    required: true
    manifests:
      - name: crl-secret
        namespace: keycloak
        files:
          - keycloak-crls-secret.yaml
```

Build, transport, and deploy:

```bash
# On the internet-connected machine
zarf package create . --confirm

# Transfer zarf-package-keycloak-crls-*.tar.zst to the airgapped environment
# Then on the airgapped cluster:
zarf package deploy zarf-package-keycloak-crls-*.tar.zst --confirm

# Verify
kubectl get secret keycloak-crls -n keycloak
```

---

## Step 4: Mount the CRL Files into the Keycloak Pod

Keycloak needs the CRL files on its local filesystem at a known path. Add a volume and volumeMount to the Keycloak StatefulSet via a UDS bundle override.

:::note[How Keycloak resolves the CRL path]
Keycloak's X.509 CRL file loader always resolves the configured `x509-cert-auth.crl-relative-path` as a file under `jboss.server.config.dir` (typically `/opt/keycloak/conf`).

This means paths like `/opt/keycloak/data/crls/DODROOTCA3.crl` will **not** be treated as absolute filesystem paths.

Recommended options:

- Mount CRLs at `/opt/keycloak/data/crls` and set `CRL Path` to `../data/crls/<filename>`.
- Or mount CRLs under `/opt/keycloak/conf/crls` and set `CRL Path` to `crls/<filename>`.
:::

### Bundle Override

In your `uds-bundle.yaml`, add the following under the `keycloak` package:

```yaml
packages:
  - name: core
    repository: oci://ghcr.io/defenseunicorns/packages/uds/core
    ref: x.x.x
    overrides:
      keycloak:
        keycloak:
          values:
            - path: extraVolumes
              value:
                - name: keycloak-crls
                  secret:
                    secretName: keycloak-crls
                    defaultMode: 0444

            - path: extraVolumeMounts
              value:
                - name: keycloak-crls
                  mountPath: /opt/keycloak/data/crls
                  readOnly: true
```

If you want to use a **relative** CRL path (for example `crls/DODROOTCA3.crl`), mount into a subdirectory under `/opt/keycloak/conf` instead:

```yaml
            - path: extraVolumeMounts
              value:
                - name: keycloak-crls
                  mountPath: /opt/keycloak/conf/crls
                  readOnly: true
```

:::note[Ordering:]
The `keycloak-crls` Secret must exist in the `keycloak` namespace _before_ Keycloak deploys or restarts with this override applied. Deploy the Zarf package from Step 3 first.
:::

After deploying, confirm the files are present in the pod:

```bash
kubectl exec -n keycloak -it keycloak-0 -- ls -la /opt/keycloak/data/crls/
```

## Step 5: Configure the Keycloak X.509 Authenticator

The x509 authenticator must be configured to disable OCSP and enable local CRL file checking. This is done via the **Keycloak Admin Console** and persists in the Keycloak database across pod restarts.

:::note[CRL signature verification requires the issuing CA]
Keycloak verifies the CRL signature. Ensure the CA(s) that issued the CRL are trusted by Keycloak (for example via the UDS Core trust bundle).
:::

:::note[Why not `realmInitEnv`?]
The `X509_OCSP_FAIL_OPEN` setting in `realmInitEnv` controls what happens when an OCSP check _fails_; it does not disable OCSP. More critically, `realmInitEnv` values are applied only during the **initial realm import**. If Keycloak is already running, changes there have no effect until the realm is re-imported from scratch. The Admin Console steps below take effect immediately.
:::

### Access the Admin Console

```bash
# Port-forward if not already accessible via ingress
kubectl port-forward -n keycloak svc/keycloak-http 8080:8080
# Then open: http://localhost:8080/admin
```

Or use `zarf connect keycloak` if configured in your environment.

### Navigate to the X.509 Step Config

1. Confirm you are in the **`uds` realm**, not `master`. Use the realm dropdown in the top-left corner to confirm or switch.
2. Click **Authentication** in the left-hand navigation.
3. Click the **`UDS Authentication`** flow.
4. Locate the step named **`X509/Validate Username Form`** (any step with "X509" in the name).
5. Click the **⚙️ gear icon** or **Config** link next to that step.

### Set the Following Fields

| Field (as seen in X509/Validate Username Form) | Value |
|---|---|
| CRL Path | Path relative to `/opt/keycloak/conf`. Multiple CRLs are semicolon-separated. |
| CRL abort if non updated | **On** |
| CRL Checking Enabled | **On** |
| OCSP Checking Enabled | **Off** |
| OCSP Fail-Open Behavior | **Off** |
| Enable CRL Distribution Point | **Off** (keep disabled to avoid live CRL fetch) |
| Check certificate validity | **On** |

Adjust filenames and path to match what you packaged in Step 3 and the `mountPath` from Step 4.

### Resulting Authenticator Config Keys

After saving, the relevant keys in the realm's authenticator configuration will be:

| Config Key | Value |
|---|---|
| `x509-cert-auth.ocsp-checking-enabled` | `false` |
| `x509-cert-auth.ocsp-fail-open` | `false` |
| `x509-cert-auth.crl-checking-enabled` | `true` |
| `x509-cert-auth.crl-relative-path` | `../data/crls/DODROOTCA3.crl;...` |
| `x509-cert-auth.crldp-checking-enabled` | `false` |

These values persist in the Keycloak database and survive pod restarts.

---

## Step 6: Verify and Troubleshoot

### Confirm CRL Files Are Present

```bash
kubectl exec -n keycloak keycloak-0 -- ls -lh /opt/keycloak/data/crls/
```

### Confirm CRL Files Are Not Expired

The Keycloak container image typically does **not** include `openssl`. Use one of the following approaches:

```bash
# Stream one CRL locally and inspect it with openssl on your workstation
kubectl exec -n keycloak keycloak-0 -- cat /opt/keycloak/data/crls/DODROOTCA3.crl > ./DODROOTCA3.crl

openssl crl -in ./DODROOTCA3.crl -inform DER -noout -text \
  | grep -E "Issuer|Last Update|Next Update"
```

Or rely on Keycloak logs, which will warn (and can be configured to abort) if `Next update` is in the past:

```bash
kubectl logs -n keycloak keycloak-0 | grep -i "CRL from"
```

### Watch Logs During a Login Attempt

```bash
kubectl logs -n keycloak -f keycloak-0 | grep -i "x509\|crl\|revoc"
```

### Common Errors

| Error | Cause | Fix |
|---|---|---|
| `Unable to read CRL from "..."` | File not present at the resolved path in the pod, or not readable by the Keycloak process | Verify the CRL exists in the pod and is readable with `kubectl exec ... ls -la`; ensure the Secret was deployed and mounted before Keycloak starts |
| `Unable to load CRL from "..."` with `Loading crl with key '...' returned null.` | Keycloak could not load the CRL file. A common cause is setting `CRL Path` to an absolute filesystem path (for example `/opt/keycloak/...`), which Keycloak still resolves relative to `/opt/keycloak/conf`. | Use a relative path like `../data/crls/<filename>` for CRLs mounted under `/opt/keycloak/data/crls`. |
| `Not possible to verify signature on CRL. X509 certificate doesn't have CA chain available` | Issuing CA cert not in Keycloak's truststore | Add DoD CA certs to the truststore. See [Truststore Customization](https://uds.defenseunicorns.com/reference/uds-core/idam/truststore-customization/) |
| `Truststore not available` | Truststore not configured | Configure the truststore (linked above) |
| `CRL has expired` | `nextUpdate` is in the past | Re-download and redeploy fresh CRL files |
| Revoked cert authenticates successfully | Wrong CRL; issuing CA mismatch | Inspect the cert's `CRL Distribution Points`; ensure you have the CRL for the exact CA that signed that cert |

---

## CRL Renewal and Maintenance

DoD CRLs have a validity window of roughly **24 hours**. After `nextUpdate`, Keycloak rejects the CRL entirely. Treat CRL renewal as a required operational process with a defined cadence, not optional maintenance.

### Refresh Process

1. On the internet-connected machine, re-download all CRL files.
2. Validate all expiry dates are in the future.
3. Recreate the Secret manifest and rebuild the Zarf package.
4. Transport and deploy the new Zarf package to the airgapped cluster.
5. Kubernetes automatically propagates updated Secret data to the mounted volume within the kubelet sync period.

Confirm the update landed:

```bash
kubectl exec -n keycloak keycloak-0 -- cat /opt/keycloak/data/crls/DODROOTCA3.crl > ./DODROOTCA3.crl
openssl crl -in ./DODROOTCA3.crl -inform DER -noout -text | grep "Next Update"
```

---

## Summary of Configuration Touchpoints

| What | How | Where |
|---|---|---|
| CRL files delivered to cluster | Zarf package → Kubernetes Secret | `keycloak-crls` Secret in `keycloak` namespace |
| CRL files mounted in pod | UDS bundle `extraVolumes` / `extraVolumeMounts` override | Helm values override in `uds-bundle.yaml` |
| OCSP disabled, CRL enabled | Keycloak Admin Console → Authentication → `UDS Authentication` flow → x509 step → ⚙️ Config | Persisted in Keycloak database |
| CA certs for CRL signature verification | Default DoD truststore (when enabled) or truststore customization | Keycloak truststore |
