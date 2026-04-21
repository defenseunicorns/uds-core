# Local Testing (Fake CA + CRL) using the CRL OCI Volume Scripts

This guide is for **local/dev testing only**.

---

## 1) Create Fake CA and CRL

> **Note:** Copy and paste the following snippet into a bash shell

```bash
# Setup working directory for PKI materials
WORKDIR="${WORKDIR:-$(pwd)/pki-crl-test}"
mkdir -p "$WORKDIR"
cd "$WORKDIR"

# Initialize OpenSSL CA database structure
mkdir -p demoCA/newcerts
: > demoCA/index.txt
echo 1000 > demoCA/serial
echo 1000 > demoCA/crlnumber

# Create OpenSSL configuration for CA and certificate generation
cat > ca.conf <<'EOF'
[ ca ]
default_ca = CA_default

[ CA_default ]
dir = .
database = $dir/demoCA/index.txt
new_certs_dir = $dir/demoCA/newcerts
certificate = $dir/ca.crt
serial = $dir/demoCA/serial
private_key = $dir/ca.key
crlnumber = $dir/demoCA/crlnumber
crl = $dir/demoCA/demo-ca.crl
default_md = sha256
default_days = 365
default_crl_days = 30
unique_subject = no
policy = policy_any
copy_extensions = copy

[ policy_any ]
commonName = supplied

[ v3_client ]
subjectAltName = @alt_names
keyUsage = digitalSignature
extendedKeyUsage = clientAuth, 2.16.840.1.101.3.6.8
certificatePolicies = @policy_anything

[ alt_names ]
# UPN (otherName) used by the UDS X.509 flow
otherName.0 = 2.16.840.1.101.3.6.6;UTF8:test@mil
email = unicorn.test@uds.dev

# Include a policy OID that UDS accepts (must match Common.REQUIRED_CERT_POLICIES)
[ policy_anything ]
policyIdentifier = 2.16.840.1.101.3.2.1.3.12
EOF

# Generate Certificate Authority (CA) key and certificate
openssl genrsa -out ca.key 2048
openssl req -x509 -new -nodes -key ca.key -sha256 -days 3650 -out ca.crt \
  -subj "/CN=UDS Scripted CRL Demo CA" \
  -addext "basicConstraints=critical,CA:TRUE" \
  -addext "keyUsage=critical,keyCertSign,cRLSign"

# Generate client certificate key and signing request
openssl genrsa -out client.key 2048
openssl req -new -key client.key -out client.csr -subj "/CN=UNICORN.TEST.USER.1234567890"
openssl ca -batch -config ca.conf -in client.csr -out client.crt -extensions v3_client

# Create PKCS12 bundle for browser import (empty password)
openssl pkcs12 -export -out client.pfx -inkey client.key -in client.crt -certfile ca.crt -passout pass:

# Generate Certificate Revocation List (CRL) in PEM (keep as .crl)
openssl ca -batch -config ca.conf -gencrl -out demoCA/demo-ca.crl

# Verify locally before packaging (this is critical)
openssl crl -in demoCA/demo-ca.crl -noout -text >/dev/null

# Package CRL into ZIP for OCI volume creation
zip -j demo-crls.zip demoCA/demo-ca.crl

# Create Zarf OCI volume package containing the CRL
cd ../
bash scripts/keycloak-crl-airgap/create-keycloak-crl-oci-volume-package.sh \
  --crl-zip "pki-crl-test/demo-crls.zip"
```

### 1.1) Configure Slim Dev Bundle

Copy the Keycloak CRL Path from the generated crl paths text file into the uds-bundle.yaml:
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
                X509_CRL_RELATIVE_PATH: "../../../tmp/keycloak-crls/demo-ca.crl" # add CRL Path here with '##' delimiter
            - path: extraVolumes
              value:
                - name: ca-certs
                  configMap:
                    name: uds-trust-bundle
                    optional: true
                - name: keycloak-crls
                  image:
                    reference: keycloak-crls:local
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

### 1.2) Add keycloak-crls package to bundle
```yaml
  - name: keycloak-crls
    path: ../../keycloak-crls/zarf-package-keycloak-crls-amd64-local.tar.zst
    ref: local
```

### 1.3) Configure CA trust via bundle and bundle config

**Add CA cert to bundle**

```bash
      istio-tenant-gateway:
        uds-istio-config:
          variables:
            - name: TENANT_TLS_CACERT
              description: "CA cert for mTLS client auth (must be base64 encoded)"
              path: tls.cacert
```

**Create `uds-config.yaml`** (run from the repo root — this encodes the CA cert and writes the full config):

```bash
CA_CERT_B64=$(base64 -w0 < pki-crl-test/ca.crt)
cat > bundles/k3d-slim-dev/uds-config.yaml << EOF
variables:
  uds-k3d-dev:
    k3d_extra_args: >-
      --k3s-arg --kube-apiserver-arg=feature-gates=ImageVolume=true@server:0
      --k3s-arg --kubelet-arg=feature-gates=ImageVolume=true@server:0
  core-base:
    CA_BUNDLE_CERTS: "${CA_CERT_B64}"
    TENANT_TLS_CACERT: "${CA_CERT_B64}"
EOF
```

- `CA_BUNDLE_CERTS` is picked up by the UDS Operator, which automatically creates/updates the `uds-trust-bundle` ConfigMap in the `keycloak` namespace.
- `TENANT_TLS_CACERT` sets the `cacert` field on the `gateway-tls` Secret during deploy.

## 2) Deploy UDS Core with CRL Configuration

```bash
uds run create:k3d-slim-dev-bundle
UDS_CONFIG=bundles/k3d-slim-dev/uds-config.yaml uds deploy bundles/k3d-slim-dev/uds-bundle-k3d-core-slim-dev-amd64-*.tar.zst --confirm --no-progress

# Connect Keycloak Admin Portal
uds zarf connect keycloak
```

---

## 3) Manual steps: Import `client.pfx` into Browser and test login

- Import `$WORKDIR/client.pfx`
- Export password: empty

Then browse:

- `https://sso.uds.dev`

You should be prompted to choose the certificate.

Get logs from attempt:

```bash
kubectl logs -n keycloak keycloak-0 -c keycloak | grep -i "x509\|crl\|revoc" | tail -n 200 >> keycloak.json
```

---

## Negative test: revoked certificate

1. Revoke and regenerate the CRL:

```bash
cd "$WORKDIR"
openssl ca -batch -config ca.conf -revoke client.crt
openssl ca -batch -config ca.conf -gencrl -out demoCA/demo-ca.crl
zip -j demo-crls.zip demoCA/demo-ca.crl
```

2. Rebuild and redeploy the CRL package:

```bash
cd <path-to-uds-core-repo>

bash scripts/keycloak-crl-airgap/create-keycloak-crl-oci-volume-package.sh \
  --crl-zip "$WORKDIR/demo-crls.zip"

uds zarf package deploy keycloak-crls/zarf-package-keycloak-crls-*.tar.zst --confirm
kubectl -n keycloak rollout restart statefulset keycloak
kubectl -n keycloak rollout status statefulset keycloak
```

3. Attempt login again. Expect failure and log messages similar to:

- `Certificate validation's failed. Certificate revoked or incorrect.`
- `Certificate has been revoked,`

4. Renew the Certificate (same as upgrade path)
```bash
cd pki-crl-test
# Clear the revocation database
cp demoCA/index.txt.attr demoCA/index.txt.attr.bak
cp demoCA/index.txt demoCA/index.txt.bak > demoCA/index.txt
echo "unique_subject = no" > demoCA/index.txt.attr

# Generate fresh CRL (empty)
openssl ca -batch -config ca.conf -gencrl -out demoCA/demo-ca.crl
zip -j demo-crls.zip demoCA/demo-ca.crl

cd <path-to-uds-core-repo>
bash scripts/keycloak-crl-airgap/create-keycloak-crl-oci-volume-package.sh --crl-zip pki-crl-test/demo-crls.zip
uds zarf package deploy keycloak-crls/zarf-package-keycloak-crls-*.tar.zst --confirm
kubectl -n keycloak rollout restart statefulset keycloak
```
