---
title: User Groups
---

UDS Core deploys Keycloak which has some preconfigured groups that applications inherit from SSO and IDP configurations.

## Applications

### Grafana

Grafana [maps the groups](https://github.com/defenseunicorns/uds-core/blob/49cb11a058a9209cee7019fa552b8c0b2ef73368/src/grafana/values/values.yaml#L37) from Keycloak to it's internal `Admin` and `Viewer` groups.

| Keycloak Group | Mapped Grafana Group |
|----------------|----------------------|
| `Admin`        | `Admin`              |
| `Auditor`      | `Viewer`             |

If a user doesn't belong to either of these Keycloak groups the user will be unauthorized when accessing Grafana.

### Neuvector

Neuvector [maps the groups](https://github.com/defenseunicorns/uds-core/blob/main/src/neuvector/chart/templates/uds-package.yaml#L31-L35) from Keycloak to it's internal `admin` and `reader` groups.

| Keycloak Group | Mapped Neuvector Group |
|----------------|------------------------|
| `Admin`        | `admin`                |
| `Auditor`      | `reader`               |

## Keycloak

:::note
All groups are under the Uds Core parent group. Frequently a group will be referred to as Uds Core/Admin or Uds Core/Auditor. In the Keycloak UI this requires an additional click to get down to the sub groups.
:::

### Identity Providers ( IDP )

UDS Core ships with a [templated](https://github.com/defenseunicorns/uds-identity-config/blob/main/src/realm.json#L1712-L1813) Google SAML IDP, more documentation to configure the `realmInitEnv` values in [uds-identity-config](https://uds.defenseunicorns.com/reference/uds-core/idam/customization/#customizing-realm).

Alternatively, the `realmInitEnv` can be configured via bundle overrides like in the [k3d-standard-bundle](https://github.com/defenseunicorns/uds-core/blob/main/bundles/k3d-standard/uds-bundle.yaml#L96).

Configuring your own IDP can be achieved via:

* Custom uds-identity-config with a templated realm.json

* Keycloak Admin UI and click ops

* Custom [realm.json](https://github.com/defenseunicorns/uds-identity-config/blob/main/src/realm.json#L1712-L1813) for direct import in Keycloak
