# Pre Core Exemptions

This package serves as a way for users deploying uds-core to create exemption resources for things that are deployed before core.

For instance, when a team is deploying a bundle that includes a custom init package with rook-ceph. During install, everything goes smoothly because Pepr's validation is not present. However, during an upgrade after the core deployment, Pepr policies will deny new rook-ceph pods.

## How to Use

Option 1: Set as values in bundle overrides
```yaml
kind: UDSBundle
metadata:
  name: example helm overrides

packages:
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

Option 2: Set as variables in bundle overrides and use `uds-config.yaml`
```yaml
kind: UDSBundle
metadata:
  name: example helm overrides

packages:
  - name: core
    path: ../../build/
    overrides:
      pre-core-exemptions:
        pre-core-exemptions:
          variables:
            - name: PRE_CORE_EXEMPTIONS_ENABLED
              path: enabled
            - name: PRE_CORE_EXEMPTIONS
              path: exemptions
```

```yaml
variables:
  core:
    PRE_CORE_EXEMPTIONS_ENABLED: true
    PRE_CORE_EXEMPTIONS: |
          - policies:
              - DisallowPrivileged
              - RequireNonRootUser
              - DropAllCapabilities
            title: "podinfo1"
            matcher:
              namespace: podinfo
              name: "^podinfo.*"
          - policies:
              - DisallowNodePortServices
            title: "podinfo2"
            matcher:
              namespace: podinfo
              name: "^.*-local.*"
              kind: service
```

Option 3: If deploying the standard package not as part of a bundle, you can use a `zarf-config.yaml`

```yaml
package:
  deploy:
    set:
      pre_core_exemptions_enabled: true
      pre_core_exemptions: |
          - policies:
              - DisallowPrivileged
              - RequireNonRootUser
              - DropAllCapabilities
            title: "podinfo1"
            matcher:
              namespace: podinfo
              name: "^podinfo.*"
          - policies:
              - DisallowNodePortServices
            title: "podinfo2"
            matcher:
              namespace: podinfo
              name: "^.*-local.*"
              kind: service
```

