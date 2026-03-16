---
title: LEGACY --Adding UDS Configuration to a Zarf Package
draft: true
---

To consider `podinfo` as a fully integrated [UDS Package](https://uds.defenseunicorns.com/structure/packages/), the `Package` Custom Resource for the UDS Operator must be included as part of the Zarf Package for `podinfo`. In this section, we will cover adding the `podinfo-package.yaml` to the sample UDS Bundle that we created in the [first](/tutorials/deploy-with-uds-core) tutorial.

### Prerequisites
This guide assumes that you created the UDS `Package` Custom Resource in the [previous](/tutorials/create-uds-package) tutorial.

### Adding Package Manifest to Podinfo

Within the `zarf.yaml` file that exists in the `package` directory, modify the `podinfo` component to reference the manifest created in the previous tutorial:

```yaml
kind: ZarfPackageConfig
metadata:
  name: podinfo
  version: 0.0.1

components:
  - name: podinfo
    required: true
    charts:
      - name: podinfo
        version: 6.10.1
        namespace: podinfo
        url: https://github.com/stefanprodan/podinfo.git
        gitPath: charts/podinfo
    # Add this new manifests section with our Package CR
    manifests:
      - name: podinfo-uds-config
        namespace: podinfo
        files:
          - podinfo-package.yaml
    images:
      - ghcr.io/stefanprodan/podinfo:6.10.1
    actions:
      onDeploy:
        after:
          - wait:
              cluster:
                kind: deployment
                name: podinfo
                namespace: podinfo
                condition: available
```

Re-run `zarf package create --confirm` and `uds create --confirm` commands to generate new artifacts that now include the `Package` Custom Resource for `podinfo`. From there, the bundle can be re-deployed (`uds deploy uds-bundle-podinfo-bundle-*-0.0.1.tar.zst --confirm`) and `podinfo` will be automatically integrated with UDS Core.

#### Next Steps

(Optional) This tutorial deployed podinfo in Istio Sidecar mode - the default deployment method for applications in UDS Core. UDS Core releases v0.40.0 and later added support for Istio Ambient Mesh. To walkthrough migrating the podinfo application to Istio Ambient Mesh using the UDS Operator, continue to the next tutorial.
