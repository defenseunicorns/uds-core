---
title: Notifications and Alerts
---

## Keycloak event logging

UDS Core provides built-in logging for user activity and administrative events in the `uds` realm.

Example user activity event:

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

Example administrative event:

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

By default, Keycloak uses the standard `JBossLoggingEventListenerProvider` and emits logs like:

```
{"timestamp":"2025-10-10T09:22:55.91473092Z","sequence":60286,"loggerClassName":"org.jboss.logging.Logger","loggerName":"org.keycloak.events","level":"INFO","message":"operationType=\"CREATE\", realmId=\"5f2749ba-d7f7-46e5-b096-6f0bf77f979f\", realmName=\"master\", clientId=\"48da20f6-5286-4f43-818b-7e10c378be6b\", userId=\"9f2a35fb-acbb-4ae5-ab54-ff46dd720b54\", ipAddress=\"127.0.0.1\", resourceType=\"CLIENT\", resourcePath=\"clients/2a7390a6-f645-49dc-9a9d-6e99fdb83b31\"","threadName":"executor-thread-40","threadId":306,"mdc":{},"ndc":"","hostName":"keycloak-0","processName":"/usr/local/openjdk-21/bin/java","processId":1}
```

### Enhanced `master` realm event logging

The UDS `JSONLogEventListenerProvider` is not enabled by default in the `master` realm. You can rely on the
built-in `JBossLoggingEventListenerProvider` or switch to `JSONLogEventListenerProvider` for more detailed events. To
enable it:

1. In the Keycloak Admin Console, select the `master` realm.
2. Go to Realm Settings > Events.
3. Add `jsonlog-event-listener` to Event Listeners.
4. Click Save.

## Keycloak notifications and alerting

Detailed notifications and alerting for Keycloak are optional and disabled by default. Enable them to receive alerts
about Keycloak configuration changes.

To enable detailed observability, add the following override to your Bundle configuration:

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

When enabled, UDS Core converts Keycloak event logs into Prometheus metrics using
[Loki recording rules](/reference/configuration/observability/logging-alerting/#deploying-recording-rules):

| Loki Recording Rule Name                        | Description                                                                                                                                                                                 |
|-------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `uds_keycloak:realm_modifications_count`        | Total number of Keycloak realm configuration changes, aggregated into 1-minute windows                                                                                                      |
| `uds_keycloak:user_modifications_count`         | Total number of Keycloak user configuration changes, aggregated into 1-minute windows                                                                                                       |
| `uds_keycloak:system_admin_modifications_count` | Total number of the Keycloak system administrator configuration changes (members of the `master` realm and `/UDS Core/Admin` members for the `uds` realm), aggregated into 1-minute windows |

View these metrics in the built-in `UDS Keycloak Notifications` Grafana dashboard:

![Keycloak Notifications Grafana Dashboard](https://github.com/defenseunicorns/uds-core/blob/main/docs/.images/sso/keycloak-notifications-grafana.png?raw=true)

Based on these metrics, UDS Core provides the following alerts:

| Alert name                                 | Metric used for alerting                        | Description                                                                                                                                                                  |
|--------------------------------------------|-------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `KeycloakRealmModificationsDetected`       | `uds_keycloak:realm_modifications_count`        | Alerts on the Keycloak realm configuration changes within a 5-minute window                                                                                                  |
| `KeycloakUserModificationsDetected`        | `uds_keycloak:user_modifications_count`         | Alerts on the Keycloak user configuration changes within a 5-minute window                                                                                                   |
| `KeycloakSystemAdminModificationsDetected` | `uds_keycloak:system_admin_modifications_count` | Alerts on the Keycloak system administrator configuration changes (members of the `master` realm and `/UDS Core/Admin` members for the `uds` realm) within a 5-minute window |

### Third-party integrations

All Keycloak notification alerts are sent to Alertmanager. Use Alertmanager to route notifications to external systems.
See [Alertmanager Configuration](https://prometheus.io/docs/alerting/latest/configuration/#receiver-integration-settings)
for configuration details.
