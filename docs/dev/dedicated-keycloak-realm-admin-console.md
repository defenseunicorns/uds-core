# Dedicated Keycloak realm admin console

## Purpose

This opt in feature exposes the dedicated Keycloak Admin Console for the UDS realm through the tenant gateway. A member of `uds-realm-user-admins` uses `https://keycloak.<domain>/admin/uds/console/` to manage UDS user profiles without master realm or admin gateway access.

The feature also provides `scripts/configure-keycloak-dedicated-admin-console.sh`. The script authenticates with a master realm Keycloak administrator, configures Keycloak 26.7 fine grained admin permissions version 2, and grants access by group membership.

For development and testing, `uds run -f src/keycloak/tasks.yaml create-insecure-realm-user-admin` generates a reusable local `realm-user-admin` credential, provisions the same restricted access, and stores the credential in the `keycloak-realm-user-admin-password` Kubernetes Secret.

## Architecture

The implementation extends the existing Keycloak `Package` rather than adding another deployment or gateway. Keycloak continues to run behind the `keycloak-waypoint` Gateway API waypoint in the `keycloak` namespace.

The chart defaults `dedicatedRealmAdminConsole.enabled` to `false`. Set the native Zarf value `keycloak.keycloak.dedicatedRealmAdminConsole.enabled: true` to activate the feature during a UDS Core deploy or upgrade. Enabling the value renders the tenant route, waypoint authorization exceptions, and path parameter protection required by the console. The chart does not change the Keycloak realm database or create an administrator. Administrator provisioning remains an explicit script or task operation.

The name follows Keycloak's “dedicated realm admin console” terminology and distinguishes this realm limited tenant route from the existing full administration gateway.

An existing stock deployment can use `scripts/configure-keycloak-dedicated-admin-console.sh` without a redeploy. The script activates the same live `Package`, `AuthorizationPolicy`, and `EnvoyFilter`, enables Keycloak administration permissions, and configures the group access in one run. This activation is idempotent but does not change the deployed Helm value.

When disabled and not activated by the script, the chart does not expose `keycloak.<domain>` through the tenant gateway. The waypoint continues to deny tenant gateway requests to `/admin*`, while the existing `sso.<domain>` authentication routes and `keycloak.<admin-domain>` administration route remain unchanged.

The request path is:

1. The browser resolves `keycloak.<domain>` and connects to the tenant gateway.
2. The tenant gateway routes the dedicated console route to the Keycloak `Package` service.
3. The Keycloak service sends inbound traffic through `keycloak-waypoint`.
4. The waypoint `AuthorizationPolicy` evaluates the source gateway namespace and request path before Keycloak receives the request.
5. Keycloak serves the realm specific Admin Console and authenticates the user against the `uds` realm.
6. Keycloak evaluates `query-users` and fine grained `Users` resource permissions for each console and Admin REST API operation.

The existing admin gateway remains the path for `https://keycloak.<admin-domain>/` and master realm administration. The tenant gateway exposes only the configured realm's console and required Admin API routes, not master realm administration.

## Authorization layers

The feature enforces authorization in separate layers. Each layer protects a different boundary.

| Layer             | Enforcement                                                                           | Effect                                                                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tenant ingress    | Keycloak `Package` exposure rule                                                      | Routes the dedicated `keycloak.<domain>` host to Keycloak.                                                                                       |
| Keycloak waypoint | `keycloak-block-admin-access-from-public-gateway` `AuthorizationPolicy`               | Denies public gateway `/admin*` and master realm traffic except for the dedicated UDS realm console and its required UDS realm Admin API routes. |
| Workload boundary | `keycloak-enforce-waypoint` `AuthorizationPolicy`                                     | Denies cross namespace direct access to Keycloak pods, forcing inbound traffic through the waypoint.                                             |
| Application       | Keycloak `uds-realm-user-admins` group, `query-users`, and FGAP v2 `Users` permission | Limits the dedicated console to UDS user administration.                                                                                         |

This combination prevents a tenant gateway route from bypassing the waypoint policy. It also prevents a valid dedicated console user from administering the master realm, because the user has no master realm role and the tenant gateway does not expose master realm administration.

## Keycloak permission design

The script enables Keycloak 26.7 fine grained admin permissions version 2 for the `uds` realm. It creates `uds-realm-user-admins`, assigns the group the `realm-management/query-users` client role, creates the `uds-realm-user-admins-policy` group policy, and creates `uds-realm-user-admins-users` with `view` and `manage` scopes for resource type `Users`.

Keycloak has no attribute only administration scope. The unrestricted `Users` resource permission can view and update every user profile field that the realm user profile allows. It can also delete users and reset passwords when Keycloak needs that fallback. It does not grant role mappings, group membership, client administration, realm administration, or impersonation. The designated administrator also has no direct `realm-management` client roles.

The group provides auditable, repeatable access control. Use an existing named federated identity where possible. Do not create users through Helm values or realm imports, because credentials would become deployment data. When a local account is necessary, the script creates it with a temporary initial password. It does not reset the password of an existing account unless the caller explicitly enables reset mode.

To revoke access, remove the user from `uds-realm-user-admins` and log out all user sessions. Delete a local fallback account when it no longer has an operational purpose.

Reference the [Keycloak 26.7 Server Administration Guide](https://www.keycloak.org/docs/26.7.0/server_admin/), including [dedicated realm admin consoles](https://www.keycloak.org/docs/26.7.0/server_admin/#_dedicated_realm_admin_consoles), [fine grained permissions](https://www.keycloak.org/docs/26.7.0/server_admin/#_fine_grained_permissions), and [managing user attributes](https://www.keycloak.org/docs/26.7.0/server_admin/#_managing_user_attributes).

## Provisioning script behavior

`scripts/configure-keycloak-dedicated-admin-console.sh` reads `KEYCLOAK_ADMIN_USERNAME`, `KEYCLOAK_ADMIN_PASSWORD`, and `UDS_REALM_ADMIN_USERNAME`. It reads `UDS_REALM_ADMIN_PASSWORD` only when it creates a local target user. It silently prompts for missing values. It defaults to the `uds` realm and `keycloak` namespace, reads the cluster domain from `ClusterConfig`, and uses a local Keycloak service port forward unless `KEYCLOAK_URL` is set. `UDS_REALM`, `KEYCLOAK_NAMESPACE`, `CLUSTER_DOMAIN`, `KEYCLOAK_LOCAL_PORT`, and `KUBECTL_BIN` override those defaults.

The script follows this flow:

1. Authenticate to the Keycloak `master` realm with the supplied administrator credentials.
2. Look up the `uds` realm, `realm-management`, and `admin-permissions` clients.
3. Find the target identity. Create an enabled local user with a temporary password only when it does not exist.
4. Enable realm administration permissions and create or update `uds-realm-user-admins`.
5. Remove direct target user `realm-management` roles, assign `query-users` to the group, and add the target user to the group.
6. Create or update the group policy and the `Users` resource permission with `view` and `manage` scopes.
7. Reconcile the Keycloak `Package` tenant console route and the two tenant restrictions in `keycloak-block-admin-access-from-public-gateway`.
8. Add `keycloak.<domain>` to the path parameter protection `EnvoyFilter`.
9. Verify the route, authorization policy restrictions, `EnvoyFilter`, group membership, role mapping, group policy, and resource permission, then print the dedicated console URL.

The script is idempotent for the route, policy, `EnvoyFilter`, group, group policy, permission, named user, and group assignment. It does not create a master realm administrator, modify user profile configuration, or grant `realm-admin`. Run `scripts/configure-keycloak-dedicated-admin-console.sh --self-test` to validate its transformation idempotency without connecting to a cluster.

Treat supplied passwords as secrets. The script does not echo, write, or store them in Kubernetes. Use the silent prompts or environment variables from an approved secret handling process, then unset the variables.

## Insecure test administrator task

The `create-insecure-realm-user-admin` task is the explicit development and test provisioning path. It requires the master bootstrap credential in `keycloak-admin-password`, so a new demo deployment must enable `INSECURE_ADMIN_PASSWORD_GENERATION=true`.

The task follows this flow:

1. Read the master username and password from `keycloak-admin-password` without printing them.
2. Reuse `realm-user-admin` and its password from `keycloak-realm-user-admin-password`, or generate a password that satisfies the default UDS realm policy.
3. Run `scripts/configure-keycloak-dedicated-admin-console.sh` with a non temporary password. Enable explicit reset mode only when the task generated a new credential.
4. Store the username and password in `keycloak-realm-user-admin-password` only after Keycloak provisioning succeeds.

The task preserves the fixed test user's Secret and password on later runs, which satisfies the realm password history policy. Delete the Secret and run the task again when you need to rotate the credential. The Secret is not part of the Helm release and Kubernetes only base64 encodes its values by default. Do not use this account in production.

## Upgrade behavior

The feature uses the existing Keycloak `Package`, tenant gateway, and waypoint. Upgrading UDS Core reconciles the exposure, `AuthorizationPolicy`, and `EnvoyFilter` resources through the package deployment. Set `keycloak.keycloak.dedicatedRealmAdminConsole.enabled: true` to preserve activation across upgrades.

A script only activation can remain live until Helm reconciles the managed resources. A later Keycloak deploy or upgrade with the value set to `false` can remove the script's route and policy changes. Re run the script to restore live activation, or enable the chart value for persistent configuration.

The configured Keycloak group, group policy, permission, and membership persist in the Keycloak database across normal upgrades. An upgrade does not reset a local user's password or remove permissions. The test credential Secret also persists because Helm does not own it. Re run the provisioning script or task to repair the configuration. Disabling the feature removes the tenant route, policy exceptions, and tenant host from path parameter protection. It does not remove group membership or revoke access through another Keycloak administration path.

## Threat model and mitigations

The main threats and controls are:

| Threat                                                                              | Mitigation                                                                                                                 |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Tenant gateway exposes the full Keycloak admin surface                              | The route and waypoint policy expose only the dedicated UDS realm console and the Admin API routes required to operate it. |
| Direct traffic bypasses gateway authorization                                       | The waypoint policy denies cross namespace direct traffic to Keycloak workloads.                                           |
| Dedicated administrator controls the master realm                                   | The account exists in `uds`, has no master realm role, and the tenant gateway does not expose master realm administration. |
| Administrator changes roles, groups, clients, realm settings, or impersonates users | FGAP v2 grants only `Users` `view` and `manage` scopes, with `query-users` for user lookup.                                |
| Administrator changes or deletes a user beyond a single attribute                   | Keycloak has no attribute only scope. Assign access only to trusted named operators and remove group membership after use. |
| Master administrator credentials leak during provisioning                           | Run the script on a trusted workstation, avoid command history exposure, and do not persist credentials.                   |
| Generated test administrator credentials leak                                       | Keep the task limited to disposable environments, restrict Secret access, and delete the local user and Secret after use.  |
| Route matching bypasses authorization with path parameters                          | Keep Keycloak path parameter protection enabled and retain the waypoint policy coverage tests.                             |

## Test evidence

The following checks ran against the feature branch through August 13, 2026.

| Check                                  | Command or method                                                                                                                                            | Result                                                                                                                 |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Keycloak chart tests                   | `helm unittest src/keycloak/chart --color`                                                                                                                   | Passed, 25 suites and 105 tests                                                                                        |
| Keycloak chart lint                    | `helm lint src/keycloak/chart`                                                                                                                               | Passed                                                                                                                 |
| Script syntax and transform validation | `bash -n scripts/configure-keycloak-dedicated-admin-console.sh && scripts/configure-keycloak-dedicated-admin-console.sh --self-test`                         | Passed                                                                                                                 |
| Insecure realm user administrator task | Ran `uds run -f src/keycloak/tasks.yaml create-insecure-realm-user-admin` twice against the disposable demo cluster                                          | Created the Secret and user, preserved the credential, returned `200` for users and `403` for clients and master realm |
| Fine grained permission setup          | Ran the script twice against disposable Keycloak 26.7 and stock UDS Core 1.8.0 with Keycloak 26.6.2, then inspected the group, role, policy, and permission  | Passed both runs in each environment, including the idempotency verification                                           |
| Permission boundary                    | Used a restricted UDS realm token to update an attribute, then attempted client, group membership, role mapping, impersonation, realm, and master operations | User read returned `200`, user update returned `204`, and each restricted request returned `403`                       |
| UDS Core unit tests                    | `npm run test:unit`                                                                                                                                          | Passed, 57 files and 1,056 tests                                                                                       |
| Values validation                      | `uds run -f tasks/lint.yaml values-lint` and `npx vitest run test/values/identity-authorization.spec.ts`                                                     | Full values lint passed, and the identity package passed 24 tests                                                      |
| Standard bundle values rendering       | `npx vitest run test/values/standard.spec.ts`                                                                                                                | Blocked before assertions because all three upstream GitHub chart download attempts returned `EOF`; 36 tests skipped   |
| Formatting                             | `npm run format:check`                                                                                                                                       | Passed                                                                                                                 |

## Fresh environment presentation runbook

Use a new, disposable UDS Core environment. Do not use production credentials or real user data.

1. Deploy the UDS Core version that includes this feature to a clean cluster with `keycloak.keycloak.dedicatedRealmAdminConsole.enabled: true`. To demonstrate stock deployment activation instead, deploy stock UDS Core with the value absent and let the script in step 4 activate the live resources.
2. Configure DNS and TLS so `keycloak.<domain>` resolves to the tenant gateway and `keycloak.<admin-domain>` resolves to the admin gateway.
3. Bootstrap a temporary master realm administrator using [Manage Keycloak admin access](/how-to-guides/identity-and-authorization/manage-admin-access/).
4. Run `uds run -f src/keycloak/tasks.yaml create-insecure-realm-user-admin`, then read the demonstration credential from `keycloak-realm-user-admin-password`. To demonstrate the production path instead, select a named federated identity and run `scripts/configure-keycloak-dedicated-admin-console.sh`.
5. Show the `uds-realm-user-admins` group, its `query-users` role, the `uds-realm-user-admins-policy` group policy, and `uds-realm-user-admins-users` `Users` permission with `view` and `manage` scopes.
6. Open `https://keycloak.<domain>/admin/uds/console/` in a clean browser profile and sign in as the demonstration user.
7. Show **Users**, change an allowed test user attribute, save it, and reopen the user to verify persistence.
8. Show that role mappings, group membership, clients, realm settings, impersonation, and master realm administration are unavailable.
9. Show the waypoint `AuthorizationPolicy` and the tenant route to demonstrate the ingress restriction.
10. Remove the demonstration identity from `uds-realm-user-admins`, log out the user's sessions, and confirm that the console no longer authorizes the account. Delete the local test user and `keycloak-realm-user-admin-password`.
11. Destroy the disposable environment and revoke the temporary master realm administrator.

The prepared presentation environment produced this evidence on August 12, 2026:

| Demonstration                                            | Evidence                                                                                                                                               |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Fresh cluster deployed                                   | `k3d-uds-dedicated-console-demo`, three Ready Kubernetes 1.35.6 nodes, stock UDS Core 1.8.0, Keycloak 26.6.2, deployment completed at 22:01 CEST       |
| Tenant URL resolves and serves the console               | `/` returned `301` to `/admin/uds/console/`; the console returned `200`                                                                                |
| Group and FGAP v2 resources are present                  | The script verified `uds-realm-user-admins`, `query-users`, `uds-realm-user-admins-policy`, and `uds-realm-user-admins-users` with `view` and `manage` |
| UDS administrator can edit the test attribute            | The restricted token read the presentation target with `200`, updated it with `204`, and read back `presentation=verified`                             |
| Restricted operations and master realm access are denied | Client administration, group membership mutation, role mapping mutation, impersonation, realm mutation, and master realm access each returned `403`    |
| Waypoint policy and tenant route are present             | `keycloak-block-admin-access-from-public-gateway`, `keycloak-tenant-dedicated-realm-admin-console`, and its redirect route are present                 |
| Access revocation succeeds                               | Run presentation step 10 after the walkthrough; it remains pending so the prepared administrator can be demonstrated                                   |
| Environment destroyed                                    | Run presentation step 11 after the walkthrough; the disposable environment remains active for the presentation                                         |
