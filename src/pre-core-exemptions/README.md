# Pre Core Exemptions

This package serves as a way for users deploying uds-core to create exemption resources for things that are deployed before core.

For instance, when a team is deploying a bundle that includes a custom init package with rook-ceph. During install, everything goes smoothly because Pepr's validation is not present. However, during an upgrade after the core deployment, Pepr policies will deny new rook-ceph pods.

## How to Use

Add helm values overrides to your `uds-bundle.yaml`:

```yaml
kind: UDSBundle
metadata:
  name: example helm overrides

packages:
  - name: custom-init
    repository: ghcr.io/custom-init
    ref: v0.1.0

  - name: core
    path: ghcr.io/defenseunicorns/packages/uds/core
    ref: 0.20.0-upstream
    overrides:
      pre-core-exemptions:
        pre-core-exemptions:
          values:
            - path: enabled
              value: true
            - path: exemptions
              value: |
                - policies:
                    - DisallowPrivileged
                    - RequireNonRootUser
                    - DropAllCapabilities
                  title: "podinfo1"
                  matcher:
                    namespace: podinfo
                    name: "^podinfo.*"
                    test: 1
                - policies:
                    - DisallowNodePortServices
                  title: "podinfo2"
                  matcher:
                    namespace: podinfo
                    name: "^.*-local.*"
                    kind: service
                    test: 2
```