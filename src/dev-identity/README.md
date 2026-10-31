<!--
Copyright 2026 Defense Unicorns
SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
-->

# Standalone development identity

This Go module contains Core's opt-in password-only development identity bridge, its strict protocol probe, and the pinned Dex derivative build recipes. It works with the existing Pepr operator and has no dependency on the Go controller migration.

Read the [development identity guide](../../docs/dev/development-identity.md) for runtime inputs, authentication limits, image builds, state persistence, and the default-disabled public CLI pairing boundary.

Run the standalone tests from this directory:

```bash
GOWORK=off go test -race ./...
```

The module keeps the qualified client projection and digest in a focused read-only contract. Its captured corpus records the source file hashes and verifies all optional fields without importing or building the controller. The runtime checks authoritative Kubernetes `Package` UIDs and exact client specifications before accepting configured pair authority.

## Sign-in theme and browser checks

The sign-in, authentication error, account, and sign-out pages use embedded HTML and CSS with the dark gray and blue form treatment used by UDS's Flowbite-based interfaces. The bridge serves the stylesheet locally, so these pages work in the airgap. The content security policy permits same-origin styles and keeps scripts, framing, and external form submissions disabled.

The [browser check](../../test/playwright/identity-login/check.mjs) starts an isolated HTTPS bridge with an in-memory test directory. It checks desktop and mobile rendering, keyboard focus, text contrast, invalid-credential recovery, and sign-in/logout and callback navigation with JavaScript disabled. The development identity workflow runs this check and retains screenshots and its report in the `identity-login-browser` artifact.

## Related documentation

The following sources describe the development provider and its public inputs:

- [Development identity guide](../../docs/dev/development-identity.md) - chart settings and verification.
- [Pinned provider inputs](provider-inputs.json) - Go, upstream Dex, patch, and runtime base.
- [Image build recipe](build-images.py) - local builds and public receipts.
