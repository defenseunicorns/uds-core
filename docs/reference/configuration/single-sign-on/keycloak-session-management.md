---
title: Keycloak Session Management
---

## Limiting the Number of Concurrent Sessions

To support operational controls around concurrent usage and to mitigate login storms, UDS Core exposes two settings:
- SSO_SESSION_MAX_PER_USER is provided via Helm values under realmInitEnv and applied during realm configuration.
- The in-flight logins limit is configured via realmConfig.maxInFlightLoginsPerUser and passed to Keycloak as a startup argument.

- `SSO_SESSION_MAX_PER_USER`: Maximum number of concurrent active sessions per user.
    - Default: 0 (unlimited, the same as the default in Keycloak)
- `realmConfig.maxInFlightLoginsPerUser`: Maximum number of in-flight (ongoing) login attempts per user.
    - Default: 300 (the same as the default in Keycloak)

Below is an example of how to set these values using the bundle overrides:

```yaml
overrides:
  keycloak:
    keycloak:
      values:
        - path: realmInitEnv
          value:
            SSO_SESSION_MAX_PER_USER: "3"
        - path: realmConfig
          value:
            maxInFlightLoginsPerUser: 1
```

## Understanding Keycloak Session Idle Timeouts

Keycloak has two session idle timeouts: the realm session idle timeout and the client session idle timeout. These settings control session expiration differently, and their interaction determines how long a user remains authenticated across different clients.

### Setting Session Timeouts from UI
Realm Session Timeouts can be configured from the Realm Settings -> Sessions tab.

Client Session Timeouts can be configured universally from the Realm Settings -> Sessions tab. Or individual clients can be configured from Clients -> client-name -> Advanced -> Advanced Settings. Client Session Timeout should always be set the same or lower than the Realm Session Timeout. Depending on your Keycloak version, a higher Client Session Timeout will either be explicitly rejected or silently ignored.

---

## Scenario 1: Client Session Idle Timeout is Shorter than Realm Session Idle Timeout

- SSO Session Idle (Realm Session Idle Timeout) = 1 hour
- Client Session Idle = 5 minutes
- User signs into Client.
- User is inactive for 7 minutes, then reactivates Client.
  - For idle timeouts, a two-minute window of time exists that the session is active. For example, when you have the timeout set to 30 minutes, it will be 32 minutes before the session expires. See docs: https://www.keycloak.org/docs/latest/server_admin/index.html#:~:text=The%20following%20logic%20is%20only%20applied%20if%20persistent%20user%20sessions%20are%20not%20active%3A

### What Happens?
1. At 5 minutes of inactivity → Client's token expires.
   - The access token is now invalid, meaning it can no longer be used for authentication.
   - The realm session is still active (since 1 hour hasn't passed).
   - If Client makes an API request, it will get a 401 Unauthorized error.

2. At 6 minutes, the user reactivates Client.
   - Since the client session timeout controls the refresh token expiration, the refresh token has also expired.
   - However, since the realm session is still active, the client/application can initiate a new authentication request to obtain fresh tokens.
     - For browser-based applications that maintain an HTTP session and Keycloak session cookies, this process occurs silently without prompting the user.
     - However, for applications using only bearer tokens, once the refresh token expires, a new authentication flow is required, meaning the user must actively reauthenticate to obtain new tokens.

---

## Scenario 2: Realm Session Idle Timeout is Shorter than Client Session Idle Timeout

::::caution
Keycloak 26.5.0+ will now prevent configuring an SSO client with a longer idle timeout than the realm idle timeout. The below scenario covers the behavior in versions before 26.5.0 (where the configuration was accepted but may behave contrary to the user's expectations).
::::

- Realm Session Idle Timeout = 10 minutes
- Client Session Idle Timeout = 30 minutes
- User signs into Client.
- User is inactive for 15 minutes, then reactivates Client.

### What Happens?
1. At 10 minutes of inactivity → Realm session expires.
   - The user's overall session ends, meaning they are logged out of all clients.
   - Any refresh tokens issued for the session become invalid.
   - If Client makes an API request, it will get a 401 Unauthorized error.

2. At 15 minutes, the user reactivates Client.
   - Since the realm session expired at 10 minutes, the user must reauthenticate.
   - Even though the client session idle timeout was longer, it does not override the realm session expiration, which takes precedence.

---

## How Refresh Token Expiration Works
- When an access token expires (default 5 minutes), the client can request a new access token using the refresh token.
- The refresh token is valid until:
  1. It reaches its idle timeout (e.g., if the user is inactive for too long).
  2. It reaches its max lifespan.
  3. The realm session expires.
  4. The user logs out.

---

## Additional Considerations
- Client session idle timeout only affects token expiration, not the realm session itself.
- If multiple clients are accessed under the same session, different client timeouts can cause token expiration at different intervals.
- A realm session timeout takes precedence, meaning once the realm session expires, all client sessions are forcibly logged out.
- Realm settings only take priority if the Clients set "Inherits from Realm settings" in the Advanced settings. Otherwise, the Client settings will take priority.
- Offline sessions allow longer session persistence beyond normal idle timeouts if configured properly.

---

## Key Takeaways
- Client session idle timeouts only affect token expiration, not the realm session itself.
- The realm session remains active for its full duration unless explicitly logged out.
- When a client session expires, it does NOT mean the user must log in again immediately.
  - If a refresh token is valid, it can still obtain a new access token.
  - If the refresh token is also expired, the user must reauthenticate.
- Realm-wide session settings take precedence over client settings, meaning once the realm session expires, the user is logged out from all clients.
