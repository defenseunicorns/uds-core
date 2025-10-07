---
title: Notifications and Alerts
---

## Keycloak event logging

UDS Core provides built-in logging for user activity and administrative events in the `uds` realm.

A typical user activity event looks like:

```json
{
    "timestamp": "2025-09-25T09:16:27.360000000Z",
    "loggerName": "uds.keycloak.plugin.eventListeners.JSONLogEventListenerProvider",
    "eventType": "USER",
    "id": "00435000-25cf-4fda-a8ef-a53d9ebab77f",
    "time": 1758791787360,
    "type": "REFRESH_TOKEN",
    "realmId": "1e78c15a-ac93-4014-aa2f-83bbe7ec0121",
    "realmName": "uds",
    "clientId": "test-client",
    "userId": "cdf56084-83c7-46fa-ae4a-1a2da352071e",
    "sessionId": "c3be023a-8e3d-4d84-a745-413ff3565f06",
    "ipAddress": "127.0.0.1",
    "error": null,
    "details": {
        "token_id": "onltrt:bbe5a8e9-6086-445b-2833-3245d4041557",
        "grant_type": "refresh_token",
        "refresh_token_type": "Refresh",
        "access_token_expiration_time": "60",
        "updated_refresh_token_id": "49344dc5-66bc-c1d3-0d9f-3b282c70ff54",
        "scope": "openid email profile",
        "age_of_refresh_token": "1689",
        "refresh_token_id": "d3319e43-be42-fc6a-5da4-f43966277c6e",
        "client_auth_method": "client-secret"
    }
}
```

A typical administrative event looks like:

```json
{
    "timestamp": "2025-09-25T08:47:33.392000000Z",
    "loggerName": "uds.keycloak.plugin.eventListeners.JSONLogEventListenerProvider",
    "eventType": "ADMIN",
    "id": "766d8e4b-41ce-4ec6-bef9-d1573cc9c720",
    "time": 1758790053392,
    "realmId": "uds",
    "realmName": "uds",
    "authDetails": {
        "realmId": "1e78c15a-ac93-4014-aa2f-83bbe7ec0121",
        "realmName": "master",
        "clientId": "38f60965-fc2c-4471-8351-02704a780945",
        "userId": "cdf56084-83c7-46fa-ae4a-1a2da352071e",
        "ipAddress": "127.0.0.1"
    },
    "resourceType": "CLIENT",
    "operationType": "UPDATE",
    "resourcePath": "clients/8e5ed10f-fde2-4ee3-990f-b3e9bf7194c6",
    "representation": "{\"id\":\"8e5ed10f-fde2-4ee3-990f-b3e9bf7194c6\",\"clientId\":\"test\",\"name\":\"\",\"description\":\"\",\"rootUrl\":\"\",\"adminUrl\":\"\",\"baseUrl\":\"\",\"surrogateAuthRequired\":false,\"enabled\":true,\"alwaysDisplayInConsole\":false,\"clientAuthenticatorType\":\"client-jwt\",\"secret\":\"**********\",\"redirectUris\":[\"/*\"],\"webOrigins\":[\"/*\"],\"notBefore\":0,\"bearerOnly\":false,\"consentRequired\":false,\"standardFlowEnabled\":true,\"implicitFlowEnabled\":false,\"directAccessGrantsEnabled\":false,\"serviceAccountsEnabled\":false,\"authorizationServicesEnabled\":false,\"publicClient\":false,\"frontchannelLogout\":true,\"protocol\":\"openid-connect\",\"attributes\":{\"realm_client\":\"false\",\"oidc.ciba.grant.enabled\":\"false\",\"client.secret.creation.time\":\"1758789997\",\"backchannel.logout.session.required\":\"true\",\"standard.token.exchange.enabled\":\"false\",\"oauth2.device.authorization.grant.enabled\":\"false\",\"backchannel.logout.revoke.offline.tokens\":\"false\",\"pkce.code.challenge.method\":\"\",\"login_theme\":\"\",\"display.on.consent.screen\":\"false\",\"consent.screen.text\":\"\",\"frontchannel.logout.url\":\"\",\"frontchannel.logout.session.required\":\"true\",\"use.jwks.url\":\"false\",\"token.endpoint.auth.signing.alg\":\"\",\"token.endpoint.auth.signing.max.exp\":\"\"},\"authenticationFlowBindingOverrides\":{},\"fullScopeAllowed\":true,\"nodeReRegistrationTimeout\":-1,\"defaultClientScopes\":[\"web-origins\",\"acr\",\"profile\",\"roles\",\"email\"],\"optionalClientScopes\":[\"address\",\"phone\",\"offline_access\",\"bare-groups\",\"microprofile-jwt\"],\"access\":{\"view\":true,\"configure\":true,\"manage\":true}}",
    "error": null,
    "details": null,
    "resourceTypeAsString": "CLIENT"
}
```

### Master realm event logging

Event logging is not enabled in the `master` realm by default because this realm may not exist. To enable it:

1. In the Keycloak Admin Console, select the `master` realm.
2. Go to Realm Settings > Events.
3. Add `jsonlog-event-listener` to Event Listeners.
4. Click Save.

## Keycloak notifications and alerting

By default, UDS Core does not enable detailed notifications and alerting for Keycloak. This feature is opt-in and must
be explicitly enabled if you want to receive advanced metrics and alerts about Keycloak configuration changes.

To enable detailed observability, set the following override in your Bundle configuration:

```yaml
packages:
  - name: core
    repository: oci://ghcr.io/defenseunicorns/packages/uds/core
    ref: x.x.x
    overrides:
      keycloak:
        keycloak:
          values:
            - path: detailedObservability.alerts.enabled
              value: true
```

When enabled, UDS Core converts Keycloak event logs into Prometheus metrics
using [Loki recording rules](/reference/configuration/observability/logging-alerting/#deploying-recording-rules):

| Loki Recording Rule Name                        | Description                                                                                                                 |
|-------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------|
| `uds_keycloak:realm_modifications_count`        | Total number of realm configuration changes, aggregated into 1-minute windows                                               |
| `uds_keycloak:user_modifications_count`         | Total number of user configuration changes, aggregated into 1-minute windows                                                |
| `uds_keycloak:system_admin_modifications_count` | Total number of system administrator configuration changes (members of `/UDS Core/Admin`), aggregated into 1-minute windows |

You can view these metrics in the built-in `UDS Keycloak Notifications` Grafana dashboard:

![Keycloak Notifications Grafana Dashboard](https://github.com/defenseunicorns/uds-core/blob/main/docs/.images/sso/keycloak-notifications-grafana.png?raw=true)

Based on these metrics, UDS Core provides three alerts:

| Alert name                                 | Metric used for alerting                        | Description                                                                                                        |
|--------------------------------------------|-------------------------------------------------|--------------------------------------------------------------------------------------------------------------------|
| `KeycloakRealmModificationsDetected`       | `uds_keycloak:realm_modifications_count`        | Alerts on realm configuration changes within a 5-minute window                                                     |
| `KeycloakUserModificationsDetected`        | `uds_keycloak:user_modifications_count`         | Alerts on user configuration changes within a 5-minute window                                                      |
| `KeycloakSystemAdminModificationsDetected` | `uds_keycloak:system_admin_modifications_count` | Alerts on system administrator configuration changes (members of `/UDS Core/Admin` group) within a 5-minute window |

### Third-party integrations

All Keycloak notification alerts are available in Grafana. System administrators can enable third-party Grafana
integrations to receive notifications in the tool of their choice.
See [Configure Grafana notifications](https://grafana.com/docs/grafana/latest/alerting/configure-notifications/) for
details.