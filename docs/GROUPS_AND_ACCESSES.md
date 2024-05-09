# UDS-CORE Groups and Accesses

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
> [!IMPORTANT]
> All groups are under the Uds-Core parent group. Frequently a group will be referred to as Uds-Core/Admin or Uds-Core/Auditor. In the Keycloak UI this requires an additional click to get down to the sub groups.

### Identity Providers ( IDP )

Generally we recommend following our process for configuring an IDP and and it's group mappings. `uds-identity-config` has some [more docs](https://github.com/defenseunicorns/uds-identity-config/blob/main/docs/CUSTOMIZE.md#customizing-realm) for the process of defining the environment variables for the [realm.json](https://github.com/defenseunicorns/uds-identity-config/blob/main/src/realm.json#L1712-L1813) file as well.

At this time Google SAML is the only provider configured to work with UDS Core Keycloak out of the box. Using Google Workspace for configuring the groups that should be mapped to Keycloak groups via an `Advanced Attribute to Group`.

There is nothing limiting the use of other IDP's, for example using gitlab or another Keycloak.

