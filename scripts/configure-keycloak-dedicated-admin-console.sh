#!/usr/bin/env bash
# Copyright 2026 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
#
# Configures the dedicated UDS realm admin console on a stock UDS Core cluster.
# Usage:
#   KEYCLOAK_ADMIN_USERNAME=... KEYCLOAK_ADMIN_PASSWORD=... \
#   UDS_REALM_ADMIN_USERNAME=... UDS_REALM_ADMIN_PASSWORD=... \
#   ./scripts/configure-keycloak-dedicated-admin-console.sh
#
# The master credentials and target username are preferred for noninteractive
# use. UDS_REALM_ADMIN_PASSWORD is required only when creating the target user.
# Missing values are prompted without echo. Optional variables: UDS_REALM (uds),
# KEYCLOAK_NAMESPACE (keycloak), CLUSTER_DOMAIN, KEYCLOAK_URL,
# KEYCLOAK_LOCAL_PORT (18080), and KUBECTL_BIN (kubectl).
# Set UDS_REALM_ADMIN_RESET_PASSWORD=true to reset an existing local user and
# UDS_REALM_ADMIN_PASSWORD_TEMPORARY=false to make that password permanent.

set -euo pipefail
umask 077

readonly PACKAGE_NAME="keycloak"
readonly POLICY_NAME="keycloak-block-admin-access-from-public-gateway"
readonly PATH_PARAMETER_FILTER_NAME="block-path-parameters-in-non-final-segments"
readonly TENANT_GATEWAY_NAMESPACE="istio-tenant-gateway"
readonly REDIRECT_DESCRIPTION="dedicated realm admin console redirect"
readonly CONSOLE_DESCRIPTION="dedicated realm admin console"
readonly REALM_ADMIN_GROUP="uds-realm-user-admins"
readonly REALM_ADMIN_POLICY="uds-realm-user-admins-policy"
readonly REALM_ADMIN_USERS_PERMISSION="uds-realm-user-admins-users"

UDS_REALM="${UDS_REALM:-uds}"
KEYCLOAK_NAMESPACE="${KEYCLOAK_NAMESPACE:-keycloak}"
KEYCLOAK_LOCAL_PORT="${KEYCLOAK_LOCAL_PORT:-18080}"
KUBECTL_BIN="${KUBECTL_BIN:-kubectl}"
KEYCLOAK_URL="${KEYCLOAK_URL:-}"
CLUSTER_DOMAIN="${CLUSTER_DOMAIN:-}"
TEMP_DIR=""
PORT_FORWARD_PID=""
KUBECTL_COMMAND=()

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

cleanup() {
  if [[ -n "$PORT_FORWARD_PID" ]] && kill -0 "$PORT_FORWARD_PID" >/dev/null 2>&1; then
    kill "$PORT_FORWARD_PID" >/dev/null 2>&1 || true
    wait "$PORT_FORWARD_PID" >/dev/null 2>&1 || true
  fi
  [[ -z "$TEMP_DIR" ]] || rm -rf "$TEMP_DIR"
}
trap cleanup EXIT

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Required command not found: $1"
}

prompt_secret() {
  local variable="$1" prompt="$2"
  if [[ -z "${!variable:-}" ]]; then
    [[ -t 0 ]] || fail "$variable must be set when standard input is not a terminal"
    read -r -s -p "$prompt: " "$variable"
    printf '\n' >&2
  fi
  [[ -n "${!variable}" ]] || fail "$variable cannot be empty"
  [[ "${!variable}" != *$'\n'* ]] || fail "$variable cannot contain a newline"
}

kubectl() {
  command "${KUBECTL_COMMAND[@]}" "$@"
}

urlencode() {
  jq -rn --arg value "$1" '$value|@uri'
}

transform_package() {
  jq --arg realm "$UDS_REALM" \
    --arg redirectDescription "$REDIRECT_DESCRIPTION" \
    --arg consoleDescription "$CONSOLE_DESCRIPTION" '
      (.spec.network.expose // []) as $expose |
      ([$expose[] | select(.gateway == "admin" and .host == "keycloak")][0].advancedHTTP? // null) as $adminAdvancedHTTP |
      .spec.network.expose = (
        $expose |
        map(select(.description != $redirectDescription and .description != $consoleDescription)) +
        [{
          description: $redirectDescription,
          service: "keycloak-http",
          selector: {"app.kubernetes.io/name": "keycloak"},
          host: "keycloak",
          port: 8080,
          advancedHTTP: {
            match: [{name: "redirect-realm-admin-console", uri: {exact: "/"}}],
            redirect: {uri: ("/admin/" + $realm + "/console/")}
          }
        }, ({
          description: $consoleDescription,
          service: "keycloak-http",
          selector: {"app.kubernetes.io/name": "keycloak"},
          host: "keycloak",
          port: 8080
        } + if $adminAdvancedHTTP == null then {} else {advancedHTTP: $adminAdvancedHTTP} end)]
      )' "$1"
}

transform_policy() {
  jq --arg realm "$UDS_REALM" --arg domain "$CLUSTER_DOMAIN" --arg tenant "$TENANT_GATEWAY_NAMESPACE" '
    def isKeycloakGatewayRule:
      (.from | length == 1) and
      (.from[0].source.notNamespaces | index("istio-admin-gateway")) != null and
      (.from[0].source.notNamespaces | index("pepr-system")) != null and
      (.to | length == 1) and
      .to[0].operation.ports == ["8080"];
    def isCombinedGatewayRule:
      isKeycloakGatewayRule and
      .to[0].operation.paths == ["/admin*", "/realms/master*"];
    def isAdminGatewayRule:
      isKeycloakGatewayRule and .to[0].operation.paths == ["/admin*"];
    def isMasterGatewayRule:
      isKeycloakGatewayRule and .to[0].operation.paths == ["/realms/master*"];
    def isTenantConsoleRule:
      .from == [{source: {namespaces: [$tenant]}}] and
      (.to | length == 1) and
      .to[0].operation.ports == ["8080"] and
      .to[0].operation.paths == ["/admin*"] and
      (((.to[0].operation.notPaths // []) | index("/admin/" + $realm + "/console")) != null or
       ((.to[0].operation.notHosts // []) | index("keycloak." + $domain)) != null);
    .spec.rules = (
      [(.spec.rules // [])[] |
        if isCombinedGatewayRule then
          . as $rule |
          ($rule | .to[0].operation.paths = ["/admin*"] | .from[0].source.notNamespaces |= (. + [$tenant] | unique)),
          ($rule | .to[0].operation.paths = ["/realms/master*"] | .from[0].source.notNamespaces |= map(select(. != $tenant)))
        else .
        end
      ] |
      map(
        if isAdminGatewayRule then .from[0].source.notNamespaces |= (. + [$tenant] | unique)
        elif isMasterGatewayRule then .from[0].source.notNamespaces |= map(select(. != $tenant))
        else .
        end
      ) |
      map(select(isTenantConsoleRule | not)) +
      [{
        from: [{source: {namespaces: [$tenant]}}],
        to: [{operation: {
          ports: ["8080"],
          paths: ["/admin*"],
          notPaths: [
            "/admin/" + $realm + "/console",
            "/admin/" + $realm + "/console/*",
            "/admin/realms/" + $realm,
            "/admin/realms/" + $realm + "/*",
            "/admin/serverinfo"
          ]
        }}]
      }, {
        from: [{source: {namespaces: [$tenant]}}],
        to: [{operation: {
          ports: ["8080"],
          paths: ["/admin*"],
          notHosts: ["keycloak." + $domain]
        }}]
      }]
    )' "$1"
}

transform_path_parameter_filter() {
  jq --arg host "keycloak.${CLUSTER_DOMAIN}" '
    .spec.configPatches[0].patch.value.typed_config.inlineCode |=
      if contains("host == \"" + $host + "\"") then .
      else sub("(?<indent>[ \\t]*)(?<keycloak>host == \"keycloak\\.[^\"]+\")"; "\(.indent)host == \"\($host)\" or\n\(.indent)\(.keycloak)")
      end' "$1"
}

api() {
  local method="$1" path="$2" request="$3" response="$4" config="$TEMP_DIR/curl.conf"
  {
    printf 'silent\nshow-error\nfail-with-body\n'
    printf 'request = "%s"\n' "$method"
    printf 'url = "%s"\n' "${KEYCLOAK_URL}${path}"
    printf 'header = "Authorization: Bearer %s"\n' "$ACCESS_TOKEN"
    printf 'header = "Content-Type: application/json"\n'
    if [[ -n "$request" ]]; then
      printf 'data-binary = "@%s"\n' "$request"
    fi
    printf 'output = "%s"\n' "$response"
  } > "$config"
  curl --config "$config"
}

json_request() {
  local output="$1"
  shift
  jq -n "$@" > "$output"
}

start_port_forward() {
  local log="$TEMP_DIR/port-forward.log"
  KEYCLOAK_URL="http://127.0.0.1:${KEYCLOAK_LOCAL_PORT}"
  kubectl -n "$KEYCLOAK_NAMESPACE" port-forward "svc/${PACKAGE_NAME}-http" "${KEYCLOAK_LOCAL_PORT}:8080" >"$log" 2>&1 &
  PORT_FORWARD_PID="$!"

  for attempt in $(seq 1 30); do
    if curl --silent --fail --connect-timeout 1 "${KEYCLOAK_URL}/realms/master" >/dev/null 2>&1; then
      return
    fi
    kill -0 "$PORT_FORWARD_PID" >/dev/null 2>&1 || {
      cat "$log" >&2
      fail "Keycloak port forward exited before becoming ready"
    }
    sleep 1
  done
  cat "$log" >&2
  fail "Timed out waiting for the Keycloak port forward"
}

verify_resources() {
  local package="$TEMP_DIR/package-final.json" policy="$TEMP_DIR/policy-final.json" path_parameter_filter="$TEMP_DIR/path-parameter-filter-final.json"
  kubectl -n "$KEYCLOAK_NAMESPACE" get package "$PACKAGE_NAME" -o json > "$package"
  jq -e --arg realm "$UDS_REALM" \
    --arg redirectDescription "$REDIRECT_DESCRIPTION" --arg consoleDescription "$CONSOLE_DESCRIPTION" '
      ([.spec.network.expose[] | select(.description == $redirectDescription)] | length == 1) and
      ([.spec.network.expose[] | select(.description == $consoleDescription)] | length == 1) and
      ([.spec.network.expose[] | select(.description == $redirectDescription)][0].advancedHTTP.redirect.uri == "/admin/" + $realm + "/console/")' "$package" >/dev/null || fail "Package verification failed"

  kubectl -n "$KEYCLOAK_NAMESPACE" get authorizationpolicy "$POLICY_NAME" -o json > "$policy"
  jq -e --arg realm "$UDS_REALM" --arg domain "$CLUSTER_DOMAIN" --arg tenant "$TENANT_GATEWAY_NAMESPACE" '
      .spec.rules as $rules |
      [$rules[] | select(.from == [{source: {namespaces: [$tenant]}}] and .to[0].operation.ports == ["8080"] and .to[0].operation.paths == ["/admin*"])] as $tenantRules |
      ($tenantRules | length == 2 and
        any(.[]; .to[0].operation.notPaths == ["/admin/" + $realm + "/console", "/admin/" + $realm + "/console/*", "/admin/realms/" + $realm, "/admin/realms/" + $realm + "/*", "/admin/serverinfo"]) and
        any(.[]; .to[0].operation.notHosts == ["keycloak." + $domain])) and
      ($rules | any(.[]; (.from[0].source.notNamespaces | index($tenant)) != null and .to[0].operation.paths == ["/admin*"])) and
      ($rules | any(.[]; (.from[0].source.notNamespaces | index($tenant)) == null and .to[0].operation.paths == ["/realms/master*"]))' "$policy" >/dev/null || fail "AuthorizationPolicy verification failed"

  kubectl -n istio-system get envoyfilter "$PATH_PARAMETER_FILTER_NAME" -o json > "$path_parameter_filter"
  jq -e --arg host "keycloak.${CLUSTER_DOMAIN}" '.spec.configPatches[0].patch.value.typed_config.inlineCode | contains("host == \"" + $host + "\"")' "$path_parameter_filter" >/dev/null || fail "EnvoyFilter verification failed"
}

configure_user() {
  local realm_path user_path group_path users user user_id group group_id client realm_management_client_id security_admin_console_client_id admin_permissions_client_id role current remove password_request create_request role_request policy policy_id permission permission_id request verify created=false
  realm_path="$(urlencode "$UDS_REALM")"
  user_path="$(urlencode "$UDS_REALM_ADMIN_USERNAME")"
  group_path="$(urlencode "$REALM_ADMIN_GROUP")"
  users="$TEMP_DIR/users.json"
  api GET "/admin/realms/${realm_path}/users?username=${user_path}&exact=true" "" "$users"
  user_id="$(jq -er --arg username "$UDS_REALM_ADMIN_USERNAME" '[.[] | select(.username == $username)] | if length == 1 then .[0].id else empty end' "$users" || true)"

  if [[ -z "$user_id" ]]; then
    created=true
    prompt_secret UDS_REALM_ADMIN_PASSWORD "UDS realm admin password"
    create_request="$TEMP_DIR/create-user.json"
    json_request "$create_request" --arg username "$UDS_REALM_ADMIN_USERNAME" '{username: $username, enabled: true}'
    api POST "/admin/realms/${realm_path}/users" "$create_request" "$TEMP_DIR/create-user-response.json"
    api GET "/admin/realms/${realm_path}/users?username=${user_path}&exact=true" "" "$users"
    user_id="$(jq -er --arg username "$UDS_REALM_ADMIN_USERNAME" '[.[] | select(.username == $username)] | if length == 1 then .[0].id else empty end' "$users")"
  fi

  user="$TEMP_DIR/user.json"
  api GET "/admin/realms/${realm_path}/users/${user_id}" "" "$user"
  jq '.enabled = true' "$user" > "$TEMP_DIR/enabled-user.json"
  api PUT "/admin/realms/${realm_path}/users/${user_id}" "$TEMP_DIR/enabled-user.json" "$TEMP_DIR/enable-user-response.json"

  if [[ "$created" == true || "$UDS_REALM_ADMIN_RESET_PASSWORD" == true ]]; then
    prompt_secret UDS_REALM_ADMIN_PASSWORD "UDS realm admin password"
    password_request="$TEMP_DIR/password.json"
    json_request "$password_request" --arg password "$UDS_REALM_ADMIN_PASSWORD" --argjson temporary "$UDS_REALM_ADMIN_PASSWORD_TEMPORARY" '{type: "password", value: $password, temporary: $temporary}'
    api PUT "/admin/realms/${realm_path}/users/${user_id}/reset-password" "$password_request" "$TEMP_DIR/reset-password-response.json"
  fi

  request="$TEMP_DIR/enable-admin-permissions.json"
  json_request "$request" '{adminPermissionsEnabled: true}'
  api PUT "/admin/realms/${realm_path}" "$request" "$TEMP_DIR/enable-admin-permissions-response.json"

  group="$TEMP_DIR/groups.json"
  api GET "/admin/realms/${realm_path}/groups?search=${group_path}&exact=true" "" "$group"
  group_id="$(jq -er --arg name "$REALM_ADMIN_GROUP" '[.[] | select(.name == $name)] | if length == 1 then .[0].id else empty end' "$group" || true)"
  if [[ -z "$group_id" ]]; then
    request="$TEMP_DIR/create-group.json"
    json_request "$request" --arg name "$REALM_ADMIN_GROUP" '{name: $name}'
    api POST "/admin/realms/${realm_path}/groups" "$request" "$TEMP_DIR/create-group-response.json"
    api GET "/admin/realms/${realm_path}/groups?search=${group_path}&exact=true" "" "$group"
    group_id="$(jq -er --arg name "$REALM_ADMIN_GROUP" '[.[] | select(.name == $name)] | if length == 1 then .[0].id else empty end' "$group")"
  fi

  client="$TEMP_DIR/client.json"
  api GET "/admin/realms/${realm_path}/clients?clientId=realm-management" "" "$client"
  realm_management_client_id="$(jq -er 'if length == 1 then .[0].id else empty end' "$client")" || fail "realm-management client not found"

  current="$TEMP_DIR/current-realm-management-roles.json"
  api GET "/admin/realms/${realm_path}/users/${user_id}/role-mappings/clients/${realm_management_client_id}" "" "$current"
  remove="$TEMP_DIR/remove-realm-management-roles.json"
  jq '.' "$current" > "$remove"
  if [[ "$(jq 'length' "$remove")" -gt 0 ]]; then
    api DELETE "/admin/realms/${realm_path}/users/${user_id}/role-mappings/clients/${realm_management_client_id}" "$remove" "$TEMP_DIR/remove-roles-response.json"
  fi

  role="$TEMP_DIR/query-users-role.json"
  api GET "/admin/realms/${realm_path}/clients/${realm_management_client_id}/roles/query-users" "" "$role"
  role_request="$TEMP_DIR/assign-query-users-role.json"
  jq '[.]' "$role" > "$role_request"

  client="$TEMP_DIR/security-admin-console-client.json"
  api GET "/admin/realms/${realm_path}/clients?clientId=security-admin-console" "" "$client"
  security_admin_console_client_id="$(jq -er 'if length == 1 then .[0].id else empty end' "$client")" || fail "security-admin-console client not found"
  current="$TEMP_DIR/current-console-realm-management-scopes.json"
  api GET "/admin/realms/${realm_path}/clients/${security_admin_console_client_id}/scope-mappings/clients/${realm_management_client_id}" "" "$current"
  if ! jq -e 'any(.[]; .name == "query-users")' "$current" >/dev/null; then
    api POST "/admin/realms/${realm_path}/clients/${security_admin_console_client_id}/scope-mappings/clients/${realm_management_client_id}" "$role_request" "$TEMP_DIR/assign-console-scope-response.json"
  fi

  current="$TEMP_DIR/current-group-realm-management-roles.json"
  api GET "/admin/realms/${realm_path}/groups/${group_id}/role-mappings/clients/${realm_management_client_id}" "" "$current"
  remove="$TEMP_DIR/remove-group-realm-management-roles.json"
  jq '.' "$current" > "$remove"
  if [[ "$(jq 'length' "$remove")" -gt 0 ]]; then
    api DELETE "/admin/realms/${realm_path}/groups/${group_id}/role-mappings/clients/${realm_management_client_id}" "$remove" "$TEMP_DIR/remove-group-roles-response.json"
  fi
  api POST "/admin/realms/${realm_path}/groups/${group_id}/role-mappings/clients/${realm_management_client_id}" "$role_request" "$TEMP_DIR/assign-group-role-response.json"

  api PUT "/admin/realms/${realm_path}/users/${user_id}/groups/${group_id}" "" "$TEMP_DIR/add-user-to-group-response.json"

  client="$TEMP_DIR/admin-permissions-client.json"
  api GET "/admin/realms/${realm_path}/clients?clientId=admin-permissions" "" "$client"
  admin_permissions_client_id="$(jq -er 'if length == 1 then .[0].id else empty end' "$client")" || fail "admin-permissions client not found"

  policy="$TEMP_DIR/group-policies.json"
  api GET "/admin/realms/${realm_path}/clients/${admin_permissions_client_id}/authz/resource-server/policy?name=$(urlencode "$REALM_ADMIN_POLICY")" "" "$policy"
  policy_id="$(jq -er --arg name "$REALM_ADMIN_POLICY" '[.[] | select(.name == $name)] | if length == 1 then .[0].id else empty end' "$policy" || true)"
  request="$TEMP_DIR/group-policy.json"
  json_request "$request" --arg id "$policy_id" --arg name "$REALM_ADMIN_POLICY" --arg groupId "$group_id" '
    {name: $name, logic: "POSITIVE", groups: [{id: $groupId}]} + if $id == "" then {} else {id: $id} end'
  if [[ -z "$policy_id" ]]; then
    api POST "/admin/realms/${realm_path}/clients/${admin_permissions_client_id}/authz/resource-server/policy/group" "$request" "$TEMP_DIR/create-group-policy-response.json"
    api GET "/admin/realms/${realm_path}/clients/${admin_permissions_client_id}/authz/resource-server/policy?name=$(urlencode "$REALM_ADMIN_POLICY")" "" "$policy"
    policy_id="$(jq -er --arg name "$REALM_ADMIN_POLICY" '[.[] | select(.name == $name)] | if length == 1 then .[0].id else empty end' "$policy")"
  else
    api PUT "/admin/realms/${realm_path}/clients/${admin_permissions_client_id}/authz/resource-server/policy/group/${policy_id}" "$request" "$TEMP_DIR/update-group-policy-response.json"
  fi

  permission="$TEMP_DIR/users-permissions.json"
  api GET "/admin/realms/${realm_path}/clients/${admin_permissions_client_id}/authz/resource-server/policy?name=$(urlencode "$REALM_ADMIN_USERS_PERMISSION")&permission=true" "" "$permission"
  permission_id="$(jq -er --arg name "$REALM_ADMIN_USERS_PERMISSION" '[.[] | select(.name == $name)] | if length == 1 then .[0].id else empty end' "$permission" || true)"
  request="$TEMP_DIR/users-permission.json"
  json_request "$request" --arg id "$permission_id" --arg name "$REALM_ADMIN_USERS_PERMISSION" --arg policy "$REALM_ADMIN_POLICY" '
    {name: $name, resourceType: "Users", scopes: ["view", "manage"], policies: [$policy]} + if $id == "" then {} else {id: $id} end'
  if [[ -z "$permission_id" ]]; then
    api POST "/admin/realms/${realm_path}/clients/${admin_permissions_client_id}/authz/resource-server/permission/scope" "$request" "$TEMP_DIR/create-users-permission-response.json"
    api GET "/admin/realms/${realm_path}/clients/${admin_permissions_client_id}/authz/resource-server/policy?name=$(urlencode "$REALM_ADMIN_USERS_PERMISSION")&permission=true" "" "$permission"
    permission_id="$(jq -er --arg name "$REALM_ADMIN_USERS_PERMISSION" '[.[] | select(.name == $name)] | if length == 1 then .[0].id else empty end' "$permission")"
  else
    api PUT "/admin/realms/${realm_path}/clients/${admin_permissions_client_id}/authz/resource-server/permission/scope/${permission_id}" "$request" "$TEMP_DIR/update-users-permission-response.json"
  fi

  verify="$TEMP_DIR/verified-realm-management-roles.json"
  api GET "/admin/realms/${realm_path}/users/${user_id}/role-mappings/clients/${realm_management_client_id}" "" "$verify"
  jq -e 'length == 0' "$verify" >/dev/null || fail "Direct realm-management role verification failed"

  api GET "/admin/realms/${realm_path}/groups/${group_id}/role-mappings/clients/${realm_management_client_id}" "" "$verify"
  jq -e 'length == 1 and .[0].name == "query-users"' "$verify" >/dev/null || fail "Group realm-management role verification failed"
  api GET "/admin/realms/${realm_path}/clients/${security_admin_console_client_id}/scope-mappings/clients/${realm_management_client_id}" "" "$verify"
  jq -e 'any(.[]; .name == "query-users")' "$verify" >/dev/null || fail "Admin console role scope verification failed"
  api GET "/admin/realms/${realm_path}/users/${user_id}/groups" "" "$verify"
  jq -e --arg groupId "$group_id" 'any(.[]; .id == $groupId)' "$verify" >/dev/null || fail "User group membership verification failed"
  api GET "/admin/realms/${realm_path}" "" "$verify"
  jq -e '.adminPermissionsEnabled == true' "$verify" >/dev/null || fail "Admin permissions verification failed"
  api GET "/admin/realms/${realm_path}/clients/${admin_permissions_client_id}/authz/resource-server/policy/group/${policy_id}" "" "$verify"
  jq -e --arg name "$REALM_ADMIN_POLICY" --arg groupId "$group_id" '
    .name == $name and .logic == "POSITIVE" and (.groups | map(.id) == [$groupId])' "$verify" >/dev/null || fail "Group policy verification failed"
  api GET "/admin/realms/${realm_path}/clients/${admin_permissions_client_id}/authz/resource-server/permission/scope/${permission_id}" "" "$verify"
  jq -e --arg name "$REALM_ADMIN_USERS_PERMISSION" '.name == $name and .resourceType == "Users"' "$verify" >/dev/null || fail "Users permission verification failed"
  api GET "/admin/realms/${realm_path}/clients/${admin_permissions_client_id}/authz/resource-server/policy/${permission_id}/scopes" "" "$verify"
  jq -e '[.[].name] | sort == ["manage", "view"]' "$verify" >/dev/null || fail "Users permission scope verification failed"
  api GET "/admin/realms/${realm_path}/clients/${admin_permissions_client_id}/authz/resource-server/policy/${permission_id}/associatedPolicies" "" "$verify"
  jq -e --arg policy "$REALM_ADMIN_POLICY" 'length == 1 and .[0].name == $policy' "$verify" >/dev/null || fail "Users permission policy verification failed"
}

self_test() {
  require_command jq
  local fixture="$TEMP_DIR/fixture.json" once="$TEMP_DIR/once.json" twice="$TEMP_DIR/twice.json" policy="$TEMP_DIR/policy.json" path_parameter_filter="$TEMP_DIR/path-parameter-filter.json"
  UDS_REALM=uds CLUSTER_DOMAIN=uds.dev
  cat > "$fixture" <<'JSON'
{"spec":{"network":{"expose":[{"description":"existing","host":"sso"},{"description":"admin access","gateway":"admin","host":"keycloak","advancedHTTP":{"headers":{"request":{"remove":["istio-mtls-client-certificate"],"add":{"istio-mtls-client-certificate":"%DOWNSTREAM_PEER_CERT%"}}}}}]}}}
JSON
  transform_package "$fixture" > "$once"
  transform_package "$once" > "$twice"
  cmp -s "$once" "$twice" || fail "Package transform is not idempotent"
  jq -e --arg description "$CONSOLE_DESCRIPTION" '[.spec.network.expose[] | select(.description == $description)][0].advancedHTTP.headers.request.remove == ["istio-mtls-client-certificate"]' "$twice" >/dev/null || fail "Package transform did not preserve admin gateway headers"
  cat > "$policy" <<'JSON'
{"spec":{"rules":[{"from":[{"source":{"notNamespaces":["istio-admin-gateway","pepr-system"],"notPrincipals":["cluster.local/ns/uds-fleet-command/sa/uds-fleet-command-sa"]}}],"to":[{"operation":{"ports":["8080"],"paths":["/admin*","/realms/master*"]}}]}]}}
JSON
  transform_policy "$policy" > "$once"
  transform_policy "$once" > "$twice"
  cmp -s "$once" "$twice" || fail "AuthorizationPolicy transform is not idempotent"
  jq -e '
    ([.spec.rules[] | select(.to[0].operation.paths == ["/admin*"] and (.from[0].source.notNamespaces | index("istio-tenant-gateway")) != null)] | length == 1) and
    ([.spec.rules[] | select(.to[0].operation.paths == ["/realms/master*"] and (.from[0].source.notNamespaces | index("istio-tenant-gateway")) == null)] | length == 1) and
    ([.spec.rules[] | select(.to[0].operation.notHosts == ["keycloak.uds.dev"])] | length == 1)
  ' "$twice" >/dev/null || fail "AuthorizationPolicy transform did not preserve gateway access controls"
  cat > "$path_parameter_filter" <<'JSON'
{"spec":{"configPatches":[{"patch":{"value":{"typed_config":{"inlineCode":"if host and (\n  host == \"sso.uds.dev\" or\n  host == \"keycloak.admin.uds.dev\"\n) then\nend"}}}}]}}
JSON
  transform_path_parameter_filter "$path_parameter_filter" > "$once"
  transform_path_parameter_filter "$once" > "$twice"
  cmp -s "$once" "$twice" || fail "EnvoyFilter transform is not idempotent"
  jq -e '.spec.configPatches[0].patch.value.typed_config.inlineCode | contains("host == \"sso.uds.dev\"") and contains("host == \"keycloak.admin.uds.dev\"") and contains("host == \"keycloak.uds.dev\"")' "$twice" >/dev/null || fail "EnvoyFilter transform did not preserve existing hosts"
  json_request "$once" --arg name "$REALM_ADMIN_POLICY" --arg groupId group-id '{name: $name, logic: "POSITIVE", groups: [{id: $groupId}]}'
  jq -e --arg name "$REALM_ADMIN_POLICY" '.name == $name and .logic == "POSITIVE" and (.groups | length == 1)' "$once" >/dev/null || fail "Group policy request is invalid"
  json_request "$twice" --arg name "$REALM_ADMIN_USERS_PERMISSION" --arg policy "$REALM_ADMIN_POLICY" '{name: $name, resourceType: "Users", scopes: ["view", "manage"], policies: [$policy]}'
  jq -e --arg name "$REALM_ADMIN_USERS_PERMISSION" --arg policy "$REALM_ADMIN_POLICY" '.name == $name and .resourceType == "Users" and .scopes == ["view", "manage"] and .policies == [$policy] and has("resources") | not' "$twice" >/dev/null || fail "Users permission request is invalid"
  json_request "$once" --arg password password --argjson temporary false '{type: "password", value: $password, temporary: $temporary}'
  jq -e '.type == "password" and .temporary == false' "$once" >/dev/null || fail "Permanent password request is invalid"
  printf 'Self-test passed.\n'
}

main() {
  TEMP_DIR="$(mktemp -d)"
  if [[ "${1:-}" == "--self-test" ]]; then
    self_test
    return
  fi
  [[ $# -eq 0 ]] || fail "Usage: $0"
  read -r -a KUBECTL_COMMAND <<< "$KUBECTL_BIN"
  [[ ${#KUBECTL_COMMAND[@]} -gt 0 ]] || fail "KUBECTL_BIN cannot be empty"
  require_command "${KUBECTL_COMMAND[0]}"
  require_command curl
  require_command jq
  UDS_REALM_ADMIN_RESET_PASSWORD="${UDS_REALM_ADMIN_RESET_PASSWORD:-false}"
  UDS_REALM_ADMIN_PASSWORD_TEMPORARY="${UDS_REALM_ADMIN_PASSWORD_TEMPORARY:-true}"
  [[ "$UDS_REALM_ADMIN_RESET_PASSWORD" == true || "$UDS_REALM_ADMIN_RESET_PASSWORD" == false ]] || fail "UDS_REALM_ADMIN_RESET_PASSWORD must be true or false"
  [[ "$UDS_REALM_ADMIN_PASSWORD_TEMPORARY" == true || "$UDS_REALM_ADMIN_PASSWORD_TEMPORARY" == false ]] || fail "UDS_REALM_ADMIN_PASSWORD_TEMPORARY must be true or false"
  prompt_secret KEYCLOAK_ADMIN_USERNAME "Keycloak master admin username"
  prompt_secret KEYCLOAK_ADMIN_PASSWORD "Keycloak master admin password"
  prompt_secret UDS_REALM_ADMIN_USERNAME "UDS realm admin username"
  [[ "$UDS_REALM" =~ ^[A-Za-z0-9._-]+$ ]] || fail "UDS_REALM is invalid"
  [[ "$KEYCLOAK_NAMESPACE" =~ ^[a-z0-9]([-a-z0-9]*[a-z0-9])?$ ]] || fail "KEYCLOAK_NAMESPACE is invalid"
  [[ "$KEYCLOAK_LOCAL_PORT" =~ ^[0-9]+$ ]] && (( KEYCLOAK_LOCAL_PORT > 0 && KEYCLOAK_LOCAL_PORT < 65536 )) || fail "KEYCLOAK_LOCAL_PORT is invalid"
  [[ "$UDS_REALM_ADMIN_USERNAME" != *$'\n'* ]] || fail "UDS_REALM_ADMIN_USERNAME cannot contain a newline"

  if [[ -z "$CLUSTER_DOMAIN" ]]; then
    CLUSTER_DOMAIN="$(kubectl get clusterconfig.uds.dev uds-cluster-config -o jsonpath='{.spec.expose.domain}')"
  fi
  [[ -n "$CLUSTER_DOMAIN" ]] || fail "ClusterConfig spec.expose.domain is empty"
  [[ "$CLUSTER_DOMAIN" =~ ^[A-Za-z0-9.-]+$ ]] || fail "CLUSTER_DOMAIN is invalid"

  if [[ -z "$KEYCLOAK_URL" ]]; then
    start_port_forward
  fi
  KEYCLOAK_URL="${KEYCLOAK_URL%/}"
  [[ "$KEYCLOAK_URL" == http://* || "$KEYCLOAK_URL" == https://* ]] || fail "KEYCLOAK_URL must be an HTTP(S) URL"
  [[ "$KEYCLOAK_URL" != *[[:space:]]* ]] || fail "KEYCLOAK_URL cannot contain whitespace"

  local token_request token_response
  token_request="$TEMP_DIR/token-request.txt"
  jq -jrn --arg username "$KEYCLOAK_ADMIN_USERNAME" --arg password "$KEYCLOAK_ADMIN_PASSWORD" \
    '{grant_type: "password", client_id: "admin-cli", username: $username, password: $password} | to_entries | map("\(.key)=\(.value|@uri)") | join("&")' > "$token_request"
  token_response="$TEMP_DIR/token-response.json"
  curl --silent --show-error --fail --request POST \
    --header 'Content-Type: application/x-www-form-urlencoded' \
    --data-binary "@${token_request}" \
    "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" > "$token_response"
  ACCESS_TOKEN="$(jq -er '.access_token' "$token_response")" || fail "Could not obtain a Keycloak admin token"

  configure_user

  local package policy path_parameter_filter
  package="$TEMP_DIR/package.json"
  kubectl -n "$KEYCLOAK_NAMESPACE" get package "$PACKAGE_NAME" -o json > "$package"
  transform_package "$package" | jq 'del(.status, .metadata.managedFields, .metadata.creationTimestamp, .metadata.generation, .metadata.resourceVersion, .metadata.uid)' > "$TEMP_DIR/package-updated.json"
  kubectl apply -f "$TEMP_DIR/package-updated.json" >/dev/null

  policy="$TEMP_DIR/policy.json"
  kubectl -n "$KEYCLOAK_NAMESPACE" get authorizationpolicy "$POLICY_NAME" -o json > "$policy"
  transform_policy "$policy" | jq 'del(.status, .metadata.managedFields, .metadata.creationTimestamp, .metadata.generation, .metadata.resourceVersion, .metadata.uid)' > "$TEMP_DIR/policy-updated.json"
  kubectl apply -f "$TEMP_DIR/policy-updated.json" >/dev/null

  path_parameter_filter="$TEMP_DIR/path-parameter-filter.json"
  kubectl -n istio-system get envoyfilter "$PATH_PARAMETER_FILTER_NAME" -o json > "$path_parameter_filter"
  transform_path_parameter_filter "$path_parameter_filter" | jq 'del(.status, .metadata.managedFields, .metadata.creationTimestamp, .metadata.generation, .metadata.resourceVersion, .metadata.uid)' > "$TEMP_DIR/path-parameter-filter-updated.json"
  kubectl apply -f "$TEMP_DIR/path-parameter-filter-updated.json" >/dev/null

  verify_resources
  printf 'Configured https://keycloak.%s/admin/%s/console/ for %s.\n' "$CLUSTER_DOMAIN" "$UDS_REALM" "$UDS_REALM_ADMIN_USERNAME"
}

main "$@"
