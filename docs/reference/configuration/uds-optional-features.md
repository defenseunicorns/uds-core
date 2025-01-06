---
title: Optional Features
---

UDS Core adds features to support specific needs that we commonly see across deployments and/or to meet the constraints and controls required by environments. This document contains features we have identified that are conditionally required or requested in environments that are present in core, but must be opted-into to use.

## Classification Banner (_EXPERIMENTAL_)

UDS Core includes a configurable [EnvoyFilter](https://istio.io/latest/docs/reference/config/networking/envoy-filter/) that will add/inject classification banners into user interfaces exposed via the Istio gateways. This is fully configurable to any classification level and can be applied to a set of hosts that you specify. The classification level set via values will also determine the color of the banner background and text, corresponding with the [standard colors](https://www.astrouxds.com/components/classification-markings) required for these markings.

Due to the wide variety of ways that user interfaces can be architected, this approach may not work for all applications and should be validated in a development or staging environment before adoption. For custom built applications, native handling of the banner within the application is often a better path. You can configure the classification banner with bundle overrides, such as the example below:

```yaml
packages:
  - name: uds-core
    repository: ghcr.io/defenseunicorns/packages/uds/core
    ref: x.x.x
    overrides:
      istio-controlplane:
        uds-global-istio-config:
          values:
            - path: classificationBanner.text
              value: "UNCLASSIFIED" # Possible values: UNCLASSIFIED, CUI, CONFIDENTIAL, SECRET, TOP SECRET, TOP SECRET//SCI, UNKNOWN
            - path: classificationBanner.addFooter
              value: true
            - path: classificationBanner.enabledHosts # Opt-in for specific hosts
              value:
                - keycloak.admin.{{ .Values.domain }} # Note the support for helm templating
                - sso.{{ .Values.domain }}
                - grafana.admin.uds.dev
```
