# Pre Core Exemptions

This package serves as a way for users deploying uds-core to pass exemptions to core for things that are deployed before core.

For example, if a team is deploying a bundle containing a custom init package that has rook-ceph, the first time it
deploys everything will be fine, but if it cycles for whatever reason once core is deployed then rook-ceph will be denied by Pepr policies. Thus an exemption CR is needed.
The problem, though, is the init package can't deploy an exemption resource when the exemption CRD has not yet been deployed by core. 

This package solves that timing issue by applying whatever exemptions are given to it as soon as the Pepr core module has been successfully deployed.

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