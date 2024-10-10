# README.md

**NAME** - enforce-mtls-strict

**INPUT** - This validation collects all `peerauthentications` from all namespaces.

**POLICY** - This policy checks if all `PeerAuthentications` have mTLS mode set to `STRICT`.

**NOTES** - Ensure that all `PeerAuthentications` are correctly configured with mTLS mode set to `STRICT`. The policy specifically looks for the `mtls.mode` field to be set to `STRICT`.