# Local Testing Example (Fake CA + CRL) for Keycloak X.509

This guide is for **local/dev testing only**. It validates that Keycloak:

- Accepts a client certificate presented through the UDS Istio gateway
- Loads a local CRL file
- Enforces revocation and freshness checks

For production/airgapped implementation details (DoD CRLs, Zarf packaging, and platform overrides), use:

- [Airgap CRL Configuration for Keycloak X.509 Authentication](/reference/configuration/single-sign-on/keycloak-crl-airgap/)

---

## Prerequisites

- A local UDS Core cluster deployed (Keycloak + Istio gateways)
- `kubectl`
- `openssl`
- Firefox (recommended for client certificate testing)

---

## 1) Deploy UDS Core locally

Deploy your local dev bundle:

```bash
uds deploy k3d-core-slim-dev:latest
```

Confirm you can reach:

- `https://sso.uds.dev`
- `https://keycloak.admin.uds.dev`

> Probably will need `zarf connect keycloak` to set up the admin user to access the Keycloak admin console.

---

## 2) Generate a fake CA, client certificate, and CRL

Run on your workstation:

```bash
set -euo pipefail

WORKDIR="${WORKDIR:-$(pwd)/pki-crl-test}"
mkdir -p "$WORKDIR"
cd "$WORKDIR"

mkdir -p demoCA/newcerts
touch demoCA/index.txt
echo 1000 > demoCA/serial
echo 1000 > demoCA/crlnumber

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
crl = $dir/crl.pem
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
otherName.0 = 2.16.840.1.101.3.6.6;UTF8:test@mil
email = unicorn.test@uds.dev

[ policy_anything ]
policyIdentifier = 2.16.840.1.101.3.2.1.3.12
EOF

# CA
openssl genrsa -out ca.key 2048
openssl req -x509 -new -nodes -key ca.key -sha256 -days 3650 -out ca.crt \
  -subj "/CN=UDS CRL Demo CA" \
  -addext "basicConstraints=critical,CA:TRUE" \
  -addext "keyUsage=critical,keyCertSign,cRLSign"

# Client cert
openssl genrsa -out client.key 2048
openssl req -new -key client.key -out client.csr -subj "/CN=UNICORN.TEST.USER.1234567890"
openssl ca -batch -config ca.conf -in client.csr -out client.crt -extensions v3_client

# PFX for browser import (empty export password)
openssl pkcs12 -export -out client.pfx -inkey client.key -in client.crt -certfile ca.crt -passout pass:

# CRL (PEM then convert to DER)
openssl ca -batch -config ca.conf -gencrl -out crl.pem
openssl crl -in crl.pem -inform PEM -out crl.der -outform DER
```

---

## 3) Configure the Istio tenant gateway to request/accept your CA

This makes the gateway:

- Advertise your CA to the browser
- Accept a client cert signed by that CA

```bash
kubectl -n istio-tenant-gateway patch secret gateway-tls \
  --type merge \
  -p '{"data": {"cacert": "'"$(base64 -w0 ca.crt)"'"}}'

kubectl -n istio-tenant-gateway rollout restart deployment tenant-ingressgateway
```

---

## 4) Ensure Keycloak trusts your CA

Keycloak must trust the issuing CA:

- To validate the client certificate chain
- To verify the CRL signature

```bash
kubectl -n keycloak create configmap uds-trust-bundle \
  --from-file=ca-bundle.pem=ca.crt \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl -n keycloak rollout restart statefulset keycloak
```

---

## 5) Deliver the CRL into the Keycloak pod

`kubectl cp` requires `tar` in the container image, which Keycloak often does not include. Use streaming copy instead:

```bash
kubectl exec -n keycloak keycloak-0 -- mkdir -p /opt/keycloak/data/crls
kubectl exec -i -n keycloak keycloak-0 -- sh -c 'cat > /opt/keycloak/data/crls/crl.der' < ./crl.der
```

Verify:

```bash
kubectl exec -n keycloak keycloak-0 -- ls -la /opt/keycloak/data/crls
```

---

## 6) Import `client.pfx` into Browser

Import `client.pfx` from the `pki-crl-test/` directory into browser’s certificate store.

- Export password: empty

---

## 7) Configure the Keycloak X.509 authenticator (critical CRL Path gotcha)

In Keycloak Admin Console:

- Realm: `uds`
- Authentication → `UDS Authentication`
- `X509/Validate Username Form` → config (gear icon)

Set:

- **Check certificate validity:** enabled
- **CRL Checking Enabled:** enabled
- **CRL abort if non updated:** enabled
- **OCSP Checking Enabled:** disabled
- **OCSP Fail-Open Behavior:** disabled
- **Enable CRL Distribution Point:** disabled

### CRL Path must be relative to `/opt/keycloak/conf`

Keycloak resolves the CRL path under `jboss.server.config.dir` (typically `/opt/keycloak/conf`).

Since the CRL file is at `/opt/keycloak/data/crls/crl.der`, set:

- **CRL Path:** `../data/crls/crl.der`

Do **not** set `/opt/keycloak/data/crls/crl.der` or Keycloak will try to read:

- `/opt/keycloak/conf//opt/keycloak/data/crls/crl.der`

#### Make sure to save the config changes!
---

## 8) Validate success

Open `https://sso.uds.dev` and select the client certificate.

To watch logs during the attempt:

```bash
kubectl logs -n keycloak keycloak-0 | grep -i "x509\|crl\|revoc" | tail -n 120
```

---

## Negative tests (and how to make them reliably take effect)

Keycloak caches CRLs in an internal Infinispan cache keyed by the configured CRL path. In practice, when iterating locally you may need to force Keycloak to re-read the CRL file. For debugging, prefer running a **single replica** so cached data is not preserved during Infinispan rebalances.

If a negative test doesn’t change behavior immediately:

- Ensure you refreshed the browser page and re-triggered a full auth attempt.
- Confirm the CRL in the pod is actually updated (stream it back out and inspect locally).
- **Restart the Keycloak StatefulSet** to force reloading cached CRL data:

```bash
kubectl -n keycloak rollout restart statefulset keycloak
```

> It can also be helpful to close and reopen the browser in between tests to ensure things are not cached in the sso.uds.dev session.

### A) Revoked certificate

Revoke and regenerate CRL:

```bash
cd "$WORKDIR"
openssl ca -batch -config ca.conf -revoke client.crt
openssl ca -batch -config ca.conf -gencrl -out crl.pem
openssl crl -in crl.pem -inform PEM -out crl.der -outform DER
```

Update the CRL in the pod:

```bash
kubectl exec -i -n keycloak keycloak-0 -- sh -c 'cat > /opt/keycloak/data/crls/crl.der' < ./crl.der
```

Restart Keycloak:

```bash
kubectl -n keycloak rollout restart statefulset keycloak
```

Attempt login. Expect failure and log messages similar to:

- `Certificate validation's failed. Certificate revoked or incorrect.`

Further you can validate in the Keycloak pod logs that the CRL has been revoked and it failed the Authentication Flow:

```bash
kubectl logs -n keycloak keycloak-0 | grep -i "Certificate has been revoked,"
```

### B) Expired CRL (tests `CRL abort if non updated`)

Generate an intentionally expired CRL:

```bash
cd "$WORKDIR"
openssl ca -batch -config ca.conf -gencrl -out crl-expired.pem \
  -crl_lastupdate 20000101000000Z \
  -crl_nextupdate 20000102000000Z

openssl crl -in crl-expired.pem -inform PEM -out crl-expired.der -outform DER
```

Update the CRL in the pod and restart Keycloak:

```bash
kubectl exec -i -n keycloak keycloak-0 -- sh -c 'cat > /opt/keycloak/data/crls/crl.der' < ./crl-expired.der
kubectl -n keycloak rollout restart statefulset keycloak
```

Restart Keycloak:

```bash
kubectl -n keycloak rollout restart statefulset keycloak
```

Attempt login. Expect failure and log messages similar to:

```bash
kubectl logs -n keycloak keycloak-0 | grep -i "is not refreshed. Next update is"
```

- `CRL from '...' is not refreshed. Next update is ...`

### C) Expired client certificate (tests `Check certificate validity`)

Generate an expired client cert and PFX:

```bash
cd "$WORKDIR"
openssl genrsa -out client-expired.key 2048
openssl req -new -key client-expired.key -out client-expired.csr -subj "/CN=UNICORN.TEST.USER.EXPIRED"

openssl ca -batch -config ca.conf -in client-expired.csr -out client-expired.crt -extensions v3_client \
  -startdate 20000101000000Z \
  -enddate 20000102000000Z

openssl pkcs12 -export -out client-expired.pfx -inkey client-expired.key -in client-expired.crt -certfile ca.crt -passout pass:
```

Import `client-expired.pfx` into Firefox and explicitly select it on the login attempt.

Attempt login, expect no x509 login prompts. However in the keycloak logs you should see a message similar to:
`x509 client certificate is not available for mutual SSL.`

```bash
kubectl logs -n keycloak keycloak-0 | grep -i "x509 client certificate is not available for mutual SSL."
```
