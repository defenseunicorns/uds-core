# UDS Core Development Certificates

This directory contains development certificates for UDS Core. These certificates are automatically generated using `mkcert` and are intended for development and testing purposes only.

## Certificate Files

- `rootCA.pem` - Certificate Authority (CA) certificate
- `uds-dev.crt` - Domain certificate for `*.uds.dev` and `uds.dev`
- `uds-dev.key` - Private key for tenant domain certificate
- `admin-uds-dev.crt` - Domain certificate for `*.admin.uds.dev` and `admin.uds.dev`
- `admin-uds-dev.key` - Private key for admin domain certificate

## Security Notice

⚠️ **These are development certificates only!**

- These certificates are NOT suitable for production use
- The CA private key is stored in this repository for development convenience
- In production, use certificates from a trusted Certificate Authority

## Regenerating Certificates

### For authorized developers with the CA private key:

```bash
uds run -f tasks/utils.yaml generate-certs --set CA_PRIVATE_KEY=<base64-encoded-private-key>
```

This will preserve the existing CA if present, or create a new one if needed. When using the `CA_PRIVATE_KEY` variable, the private key is cleaned up from the filesystem after generating certificates.

## Trust the CA Locally

### If you have this repository cloned:

**macOS/Linux:**
```bash
export CAROOT=$(pwd)/certs
mkcert -install
```

### If you don't have the repository cloned:

**macOS/Linux:**
```bash
# Download the CA certificate and install it with mkcert
mkdir -p /tmp/uds-ca
curl -fsSL https://raw.githubusercontent.com/defenseunicorns/uds-core/main/certs/rootCA.pem -o /tmp/uds-ca/rootCA.pem
curl -fsSL https://raw.githubusercontent.com/defenseunicorns/uds-core/main/certs/rootCA-key.pem -o /tmp/uds-ca/rootCA-key.pem
export CAROOT=/tmp/uds-ca
mkcert -install
```

This will download the UDS Local CA from GitHub and install it into your system's trust store.

Note: The `generate-certs` task automatically handles this when regenerating certificates.
