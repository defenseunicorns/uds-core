---
title: Keycloak Session Timeout
---

## Understanding Keycloak Session Idle Timeouts

Keycloak has two session idle timeouts: the **realm session idle timeout** and the **client session idle timeout**. These settings control session expiration differently, and their interaction determines how long a user remains authenticated across different clients.

---

## Scenario 1: Client Session Idle Timeout is Shorter than Realm Session Idle Timeout

- **Realm Session Idle Timeout** = **1 hour**
- **Client Session Idle Timeout** = **5 minutes**
- **User signs into Client.**
- **User is inactive for 6 minutes**, then reactivates Client.

### What Happens?
1. **At 5 minutes of inactivity** → **Client's token expires**
   - The access token is now **invalid**, meaning it can no longer be used for authentication.
   - The **realm session is still active** (since 1 hour hasn't passed).
   - If Client makes an API request, it will get a **401 Unauthorized** error.

2. **At 6 minutes**, the user **reactivates Client**.
   - Since the **client session timeout** controls the refresh token expiration, the refresh token has also expired.
   - However, since the **realm session is still active**, the client/application can initiate a new authentication request to obtain fresh tokens. This process does not prompt the user for credentials again as long as the realm session remains valid.

---

## Scenario 2: Realm Session Idle Timeout is Shorter than Client Session Idle Timeout

- **Realm Session Idle Timeout** = **10 minutes**
- **Client Session Idle Timeout** = **30 minutes**
- **User signs into Client.**
- **User is inactive for 15 minutes**, then reactivates Client.

### What Happens?
1. **At 10 minutes of inactivity** → **Realm session expires**
   - The user's **overall session ends**, meaning they are logged out of all clients.
   - Any refresh tokens issued for the session become **invalid**.
   - If Client makes an API request, it will get a **401 Unauthorized** error.

2. **At 15 minutes**, the user **reactivates Client**.
   - Since the **realm session expired at 10 minutes**, the user must **reauthenticate**.
   - Even though the client session idle timeout was longer, it does not override the **realm session expiration**, which takes precedence.

---

## How Refresh Token Expiration Works
- When an **access token expires** (default **5 minutes**), the client can **request a new access token** using the refresh token.
- The refresh token is **valid until**:
  1. It reaches its **idle timeout** (e.g., if the user is inactive for too long).
  2. It reaches its **max lifespan**.
  3. The **realm session expires**.
  4. The **user logs out**.

---

## Additional Considerations
- **Client session idle timeout only affects token expiration**, not the realm session itself.
- If multiple clients are accessed under the same session, different client timeouts can cause token expiration at different intervals.
- A realm session timeout takes **precedence**, meaning once the realm session expires, all client sessions are forcibly logged out.
- **Offline sessions** allow longer session persistence beyond normal idle timeouts if configured properly.
- To prevent unwanted logouts, applications can implement **silent authentication** via refresh tokens or use offline tokens when necessary.

---

## Key Takeaways
- **Client session idle timeouts only affect token expiration**, not the realm session itself.
- The **realm session remains active for its full duration** unless explicitly logged out.
- **When a client session expires, it does NOT mean the user must log in again immediately**.
  - If a **refresh token is valid**, it can still obtain a new access token.
  - If the **refresh token is also expired**, the user must **reauthenticate**.
- **Realm-wide session settings take precedence over client settings**, meaning once the realm session expires, the user is logged out from all clients.

