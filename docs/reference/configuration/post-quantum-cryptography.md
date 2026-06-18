---
title: Post-quantum cryptography
description: Reference for the ISTIO_COMPLIANCE_POLICY toggle that forces post-quantum hybrid key exchange (X25519MLKEM768) across the UDS Core Istio service mesh, including accepted values, the support matrix, and force-mode behavior.
sidebar:
  order: 3.004
---

UDS Core can force post-quantum cryptography (PQC) across the Istio service mesh through the `ISTIO_COMPLIANCE_POLICY` variable, which sets Istio's `COMPLIANCE_POLICY` on both the control plane and the ztunnel data plane. The toggle is off by default: until you set it, the mesh keeps Istio's standard TLS behavior, and deployments render identically to a build without the variable.

## Compliance policy variable

`ISTIO_COMPLIANCE_POLICY` is a single variable declared on both the `istiod` and `ztunnel` charts of the `istio-controlplane` package, so one value sets both injection points.

| Variable | Type | Default | Description |
|---|---|---|---|
| `ISTIO_COMPLIANCE_POLICY` | string | unset | Sets Istio's `COMPLIANCE_POLICY`. Accepted value: `pqc`. When set to `pqc`, Istio enforces TLS 1.3, the `TLS_AES_128_GCM_SHA256` and `TLS_AES_256_GCM_SHA384` cipher suites, and the `X25519MLKEM768` hybrid key exchange group on Envoy mTLS, Envoy downstream and upstream TLS (including gateways), the ztunnel L4 mTLS hop, and the xDS channel. When unset, the mesh uses Istio's default behavior. |

> [!NOTE]
> In ambient mode the policy must be set on both `istiod` and `ztunnel`. Setting it on `istiod` alone does not flip the ztunnel L4 hop, so the variable maps to two chart paths: `pilot.env.COMPLIANCE_POLICY` on `istiod` and `env.COMPLIANCE_POLICY` on `ztunnel`.

> [!NOTE]
> `pqc` is the only value UDS Core supports through this toggle. Istio's upstream `COMPLIANCE_POLICY` also accepts `fips-140-2`, but UDS Core does not support that value here.

The UDS Core standard and slim-dev bundles already declare `ISTIO_COMPLIANCE_POLICY` on both charts, so you can set the value at deploy time without editing the bundle:

```yaml title="uds-config.yaml"
variables:
  core:
    # Force post-quantum key exchange across the mesh
    ISTIO_COMPLIANCE_POLICY: pqc
```

You can also pass it as a deploy flag with `uds deploy <bundle> --set ISTIO_COMPLIANCE_POLICY=pqc`.

In a custom bundle, declare the variable on both charts so a single value drives the control plane and the ztunnel data plane together:

```yaml title="uds-bundle.yaml"
overrides:
  core:
    istio-controlplane:
      istiod:
        variables:
          - name: ISTIO_COMPLIANCE_POLICY
            path: pilot.env.COMPLIANCE_POLICY
      ztunnel:
        variables:
          - name: ISTIO_COMPLIANCE_POLICY
            path: env.COMPLIANCE_POLICY
```

## Support matrix

PQC depends on the cryptographic library that ztunnel is built against, so support is limited to the non-FIPS `upstream` flavor running in ambient mode.

| Flavor | PQC (`pqc`) supported | Reason |
|---|---|---|
| `upstream` | Yes | ztunnel is built against aws-lc-rs, which supports the `X25519MLKEM768` hybrid group |
| `registry1` | No | The FIPS ztunnel uses a vendored BoringSSL that predates the hybrid group |
| `unicorn` | No | The FIPS ztunnel uses a vendored BoringSSL that predates the hybrid group |

> [!CAUTION]
> Do not set `ISTIO_COMPLIANCE_POLICY=pqc` on a FIPS flavor (`registry1` or `unicorn`). The FIPS ztunnel cannot negotiate `X25519MLKEM768`, so mesh mTLS will fail. PQC with FIPS is not supported.

## Force-mode behavior

The `pqc` policy forces post-quantum key exchange; it does not prefer it. Any TLS peer that cannot negotiate `X25519MLKEM768` is rejected rather than downgraded to a classical group. Two consequences follow directly:

- **Egress.** Traffic that leaves the mesh through the egress waypoint to an external host without `X25519MLKEM768` support fails the TLS handshake.
- **Ingress.** The tenant gateway accepts only PQC-capable clients. Current Chrome and Firefox negotiate the group; older browsers, some API clients, and older Safari and iOS versions may fail to connect.

> [!NOTE]
> Forcing PQC at the edge while still accepting classical clients at ingress (a per-gateway "prefer" mode) is not part of this toggle. The policy applies mesh-wide.

## Related documentation

- [Enable post-quantum cryptography](/how-to-guides/networking/enable-post-quantum-cryptography/) - turn on PQC and verify the gateway and mesh enforce it
- [Configure core network access](/how-to-guides/networking/configure-core-network-access/) - related ingress and egress configuration
- [Istio 1.27 change notes](https://istio.io/latest/news/releases/1.27.x/announcing-1.27/change-notes/) - upstream introduction of the `COMPLIANCE_POLICY` post-quantum option
