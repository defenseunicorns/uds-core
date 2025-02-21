---
title: Keycloak Session Timeout
---

## Understanding Keycloak Session Idle Timeouts

Keycloak has two main session idle timeouts: the **realm session idle timeout** and the **client session idle timeout**. These settings control session expiration behavior differently, and their interaction determines how long a user remains authenticated across different clients.

---

## Scenario 1: Client Session Idle Timeout is Longer than Realm Session Idle Timeout

- **Realm Session Idle Timeout** = **1 hour** (Controls the overall user session expiration)
- **Client Session Idle Timeout** = **10 minutes**
- **User signs into Client.**
- **User is inactive for 11 minutes**, then reactivates Client.

### What Happens?
1. **At 10 minutes of inactivity** → **Client's token expires**
   - The access token is now **invalid**, meaning it can no longer be used for authentication.
   - The **realm session is still active** (since 1 hour hasn't passed).
   - If Client makes an API request, it will get a **401 Unauthorized** error.

2. **At 11 minutes**, the user **reactivates Client** (e.g., clicks a button or makes a request).
   - Since **Client's session is expired**, it **cannot use its existing access token**.
   - However, if the user still has a **valid refresh token**, Client **can attempt a token refresh**.
   - If refresh tokens are **still valid**, Client gets a new access token **without prompting the user to log in again**.
   - If refresh tokens have expired, the user is **forced to log in again**.

---

## Scenario 2: Client Session Idle Timeout is Shorter than Realm Session Idle Timeout

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
   - If the refresh token is still valid, Client can obtain a new access token.
   - If the refresh token has expired, the user must **reauthenticate**.

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

