# Root CA Certificate Retriever

## Overview

Automates downloading and managing root CA certificates for UDS Core. Handles both DoD certificates and public CA certificates from Mozilla's curated list.

## Usage

```bash
# Download and update certificates
uds run update-ca-certs

# Check for certificate differences
uds run check-ca-certs
```

**Normal mode**: Downloads certificates and updates the ConfigMap
**Check mode**: Validates certificates and reports differences (useful for CI)

## Testing

```bash
npm run test
```

## Key Files

- `scripts/root-ca-retriever/index.ts` - Main orchestration script
- `scripts/root-ca-retriever/dod-certs.ts` - DoD certificate handling
- `scripts/root-ca-retriever/public-certs.ts` - Public CA certificate handling with trust configuration
- `certs/public/uds-core-public-ca-trust-config.yaml` - Trust config for public CAs

## Output

- DoD certificates: `certs/dod/`
- Public certificates: `certs/public/ca-bundle.pem`
- ConfigMap: `src/pepr/uds-operator-config/templates/uds-ca-certs.yaml`