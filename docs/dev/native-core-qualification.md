<!--
Copyright 2026 Defense Unicorns
SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
-->

# Native development Core qualification ledger

This ledger separates current validation from historical measurements. The
October 31 checks use Core 1.16.0 inputs and the current implementation branches.
Earlier performance measurements apply only to their recorded artifacts,
including combined checkpoint `0b2cc45304f783c01d3fc80178867ef350fa95bf`.

## Current installation boundary

Run the native package installer inside the target guest's network namespace.
The bootstrap helper verifies actual DNS answers through the cluster's
`kube-dns` Service IP and checks the private gateway addresses. Access through a
remote kubeconfig alone does not provide this network path. A host-side K3d
installation stops at this DNS gate and retains the tenant admission fence.
Use an installer in the node's network namespace; keep the original DNS check
and its deadline.

The regular package opens tenant admission only after the final readiness gate.
The `--candidate` and `--base` preparations retain the fence. The base profile
also excludes identity and gateways; it is a building block for an explicitly
qualified assembly, not a complete Go-plus-Keycloak installation. Do not remove
the fence manually to advance an incomplete installation.

## Build with local identity images

Build both providers with the [identity build recipe](development-identity.md#build-and-verify-the-provider)
and include `--save-images`. Use the resulting absolute `build-receipt.json`
path and keep those images loaded in the same Docker daemon. The receipt path
supports new local image tags and image metadata without editing the tracked
baseline lock or static chart values.

Run preparation from a checkout that contains the pinned Core source history:

```bash
node packages/native-dev/prepare.mjs --package --connected \
  --identity-build-receipt /absolute/identity-build/build-receipt.json \
  --go /absolute/path/to/go --uds /absolute/path/to/uds --docker /usr/bin/docker
```

Preparation verifies the compiler, current source and image recipes, OCI archive
checksums, Linux AMD64 manifests and the loaded local images. It generates an
image-values overlay and records the receipt digest in `build-lock.json`.
`liveQualified: false` describes the build's scope: integrity checks do not
replace the runtime validation for the selected images. The default path retains
the frozen image selection, and `--render-only` does not require Docker unless
you also select a local image-build receipt.

## October 31 revalidation

The implementation branches include upstream commit
`129d6e4a1928ce2b10ba6c5c8b5a0e7350f4053c`. The build uses Go 1.27.1,
Node 26.13.0, UDS CLI 0.40.0 and actual K3s 1.37.1 clusters. The Core 1.16.0
base and identity input archives pass signature verification against the
upstream release workflow identity.

The current source checks cover the following behavior:

- The controller passes 1,804 Go race cases/subtests, vet, build, 1,117 current
  Pepr unit tests and deterministic regeneration of all 76 API/client files.
  Its Package validator matches 140 decisions captured from the current source
  tests, including deletion guards and reserved probe client IDs.
- Standalone identity passes 151 bridge race cases, 279 patched-Dex race cases,
  vet, 138 chart assertions and 60 package-values tests.
- The composition passes 32 assertions and the bootstrap race suite using the
  real embedded UDS CLI. It verifies source inputs, provider build recipes,
  signed chart versions and every packaged runtime image digest. CI workflows
  now run each implementation's source checks and the combined render.

The standalone Pepr-plus-Dex runtime passes the strict-TLS identity lifecycle
and Pod-replacement persistence probes, nine unchanged browser assertions and
all six original Fleet assertions. The supported profile has exactly two
issuers. Unknown browser origins return HTTP 421; additional SSO issuers,
Java console assets and Java session-status iframes remain unsupported. See the
[identity guide](development-identity.md) for the complete profile boundary.

The combined runtime completes a fresh installation from empty storage using
the corrected installer network. All four controller phases use the same
verified image. Native bindings, callback canaries, identity and private DNS
pass before the regular package removes the fence. The earlier host-network
attempt remains a failed attempt: an actual API dry-run confirmed that its
retained fence denied tenant authoring. These runs do not repeat the historical
memory, density or latency comparisons below.

## Historical measurements

The [historical qualification record](native-core-historical-qualification.md)
retains the Core 1.14 source checkpoints, original failures and repairs, resource
measurements and isolated-guest experiments. Those measurements do not describe
the current Core 1.16 images and do not establish a new performance comparison.

## Related documentation

The following guides describe the supported implementation boundaries:

- [Native controller](../../src/go-controller/README.md) covers controller ownership and Java Keycloak integration.
- [Native admission](../../src/go-controller/native-admission/README.md) covers policy activation and recovery.
- [Development identity](development-identity.md) covers the password-only provider and image build receipts.
