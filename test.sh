ACCESS_TOKEN=$(curl -s -X POST "https://keycloak.admin.uds.dev/realms/uds/protocol/openid-connect/token" \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "client_id=pepr" \
     -d "client_secret=pepr" \
     -d "grant_type=client_credentials" | jq -r .access_token)

echo "Access Token: $ACCESS_TOKEN"

echo $ACCESS_TOKEN | jwt decode -
