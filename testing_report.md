# CORE-783 GitLab test report

On November 20, 2026, the private GitLab API and a shallow Git clone worked through a protected tenant hostname on `k3d-uds`. Both used a Keycloak service-account token and GitLab's own credential. A GitLab personal access token (PAT) alone entered the interactive login flow. These results apply to GitLab UDS Package `19.6.0-uds.0-upstream` with the Ambient mesh.

## Package configuration tested

The live `uds.dev/v1alpha1` Package was `gitlab/gitlab`. Before opting in, the read-only PAT alone returned `200` for `GET /api/v4/user` as `test-bot`. Generation 2 added the following exposure settings and two clients. This excerpt omits the existing native SAML client and unrelated Package fields.

```yaml
spec:
  network:
    serviceMesh:
      mode: ambient
    expose:
      - host: gitlab
        gateway: tenant
        service: gitlab-webservice-default
        port: 8181
        selector:
          app: webservice
        # CORE-783 adds this optional authentication block to protect the exposed hostname.
        authentication:
          mode: authservice
          ssoClientId: gitlab-ingress-auth
          machineClientId: gitlab-machine
  sso:
    - name: GitLab ingress authentication
      clientId: gitlab-ingress-auth
      redirectUris:
        - https://gitlab.uds.dev/authservice/callback
    - name: GitLab machine access
      clientId: gitlab-machine
      standardFlowEnabled: false
      serviceAccountsEnabled: true
      secretConfig:
        name: gitlab-machine-secret
        template:
          client_secret: clientField(secret)
      protocolMappers:
        - name: GitLab audience
          protocol: openid-connect
          protocolMapper: oidc-audience-mapper
          config:
            included.client.audience: gitlab-ingress-auth
            access.token.claim: "true"
```

GitLab retained its native SAML client, `uds-swf-gitlab-saml`, with callback `https://gitlab.uds.dev/users/auth/saml/callback`. The protected exposure omitted uptime checks. The separate `gitlab-registry` and `*.pages` exposures kept their existing configuration.

The operator reported `Ready` with `observedGeneration: 2`. The webservice Service had selector labels `app=webservice`, `release=gitlab`, and `gitlab.com/webservice-name=default`, and enrolled in `gitlab-ingress-auth-waypoint`. The tenant gateway had one generated RequestAuthentication and two AuthorizationPolicies. The workload had one of each. The issued token had the UDS realm issuer, audience `gitlab-ingress-auth`, and presenter `gitlab-machine`. Its subject matched the subject restriction in both generated authorization policies.

## Admission results

Kubernetes server-side dry-runs used the deployed GitLab Package. Its persisted generation stayed at 2.

| Change to the CR                                                                        | Admission result                                                                                        |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Keep the deployed machine-client reference                                              | Accepted                                                                                                |
| Reference a nonexistent machine client                                                  | Rejected                                                                                                |
| Select the admin gateway                                                                | Rejected                                                                                                |
| Set the first ingress callback to a different hostname                                  | Rejected                                                                                                |
| Map the machine token to an unrelated audience                                          | Rejected                                                                                                |
| Add a second, unprotected hostname for the webservice Service                           | Rejected                                                                                                |
| Add an uptime check to the protected exposure                                           | Rejected                                                                                                |
| Set the ingress callback to GitLab's existing native SAML callback on the **same** host | **Accepted.** Admission did not catch this known route collision. The live callbacks remained distinct. |

## Browser and native login

A fresh request without a machine token returned `302` to the UDS realm's OIDC authorization endpoint for each of `/`, `/users/sign_in`, `/-/readiness`, an unknown application path, and `/users/auth/saml/callback`. The authorization request named `gitlab-ingress-auth` as its client and `https://gitlab.uds.dev/authservice/callback` as its redirect URI. Chrome displayed the **GitLab ingress authentication** sign-in form at `sso.uds.dev`. These checks exercise hostname-wide protection, including the native login and health endpoints.

Chrome Profile 1 exercised the following sequence with the repository's `doug` fixture account.

| Step                                    | Observed result                                                                                                                                                                  |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Submit the Keycloak login form          | Keycloak displayed **Invalid username or password** at `/realms/uds/login-actions/authenticate`. Browser input errors also occurred. The cause of the rejection is undetermined. |
| Open `/-/readiness` in the same browser | Redirected to SSO. This session did not demonstrate successful ingress authentication.                                                                                           |
| Visit the reserved `/logout` path       | Keycloak displayed its logout confirmation, followed by **You are logged out**. Revisiting GitLab returned to the ingress login form.                                            |

The browser did not reach the successful Authservice callback, GitLab's native SAML callback, or a signed-in GitLab page. Single sign-on across both clients, session reuse without a second prompt, and logout of an authenticated GitLab session remain unverified.

## Machine flows

### Client credentials

Set `GITLAB_MACHINE_CLIENT_SECRET` from the `client_secret` key in the Package-managed Secret `gitlab/gitlab-machine-secret`. Request an access token from Keycloak. The Package audience mapper adds `gitlab-ingress-auth` to the token.

```bash
UDS_TOKEN=$(curl --fail --silent --show-error \
  --data-urlencode 'grant_type=client_credentials' \
  --data-urlencode 'client_id=gitlab-machine' \
  --data-urlencode "client_secret=$GITLAB_MACHINE_CLIENT_SECRET" \
  https://sso.uds.dev/realms/uds/protocol/openid-connect/token | jq -er '.access_token')
```

Send the UDS token to ingress and the GitLab PAT to the application in the same request. The test used the PAT for `test-bot`, scoped to `read_api` and `read_repository`. GitLab returned HTTP `200` and the command printed `test-bot`.

```bash
curl --fail --silent --show-error \
  -H "x-uds-machine-token: Bearer $UDS_TOKEN" \
  -H "Authorization: Bearer $GITLAB_PAT" \
  https://gitlab.uds.dev/api/v4/user | jq -er '.username'
```

### Results

The private repository fixture was `test-bot/machine-access-test`.

| Scenario                                                          | Observed result                                                                                                                                                                                                                                    |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitLab PAT alone, in either `Authorization` or `PRIVATE-TOKEN`    | `302` to Keycloak on `GET /api/v4/user`                                                                                                                                                                                                            |
| Malformed UDS token and valid PAT                                 | `401`                                                                                                                                                                                                                                              |
| Valid UDS token with missing or invalid GitLab credential         | GitLab returned `401` JSON                                                                                                                                                                                                                         |
| Valid UDS token with a valid GitLab Bearer PAT or `PRIVATE-TOKEN` | GitLab returned `200` and identified `test-bot`                                                                                                                                                                                                    |
| Git over HTTPS with both credentials                              | `git ls-remote` resolved the private repository's HEAD. A shallow clone checked out the commit and contained `README.md`.                                                                                                                          |
| Git LFS download batch with GitLab Basic credentials only         | `302` to Keycloak                                                                                                                                                                                                                                  |
| Git LFS download batch with both credentials                      | Empty batch returned `404`; the GitLab LFS controller logged `test-bot`. A batch requesting one nonexistent object returned `200` with the LFS media type and a per-object `404`. This verifies negotiation only.                                  |
| Runner verification with an invalid runner token                  | `POST /api/v4/runners/verify` returned `302` without the UDS token and `403` JSON with it. GitLab still required a runner credential.                                                                                                              |
| Registry authentication                                           | The registry's `/v2/` returned a `401` challenge pointing to `gitlab.uds.dev/jwt/auth`. Basic credentials alone at that endpoint returned `302`. Adding the UDS token returned a registry token, which the registry accepted at `/v2/` with `200`. |
| Direct Service access                                             | A request from the GitLab toolbox to `http://gitlab-webservice-default.gitlab.svc.cluster.local:8181/api/v4/user` returned `403`.                                                                                                                  |

## Coverage limits

The ticket names runners, LFS and registry exchanges. This test covered runner credential rejection, LFS negotiation and registry token exchange. A registered runner executing a job, transfer of actual LFS bytes, an image pull or push, Git writes, and Artifactory remain unverified. Clients must be able to attach the UDS header to requests on the protected host. The existing GitLab settings and bot-account jobs call the Service directly and ran before opt-in.

The [Core e2e suite](test/vitest/integration-machine-access.spec.ts) passed all 10 checks across Sidecar and Ambient, including app credential preservation, reserved-token stripping, wrong-client rejection, malformed headers and cleanup on update. GitLab itself ran in Ambient only. The test cluster used the license-free migration fixture after the packaged migration encountered an empty license, and the shared Istio CNI was restarted before the final tests.
