## Keycloak

### Playing with keycloak things:

`uds run dev-setup`

`npx pepr deploy`

`uds run dev-deploy --set PKG=keycloak`

more things here....

### Updating Istio Gateway CA Cert

If using a different identity config image, with a custom truststore included, you will need to update the CA cert value for the tenant gateway. The UDS task `uds run -f src/keycloak/tasks.yaml cacert --set IMAGE_NAME=<your config image> --set VERSION=<your image version>` can be run to output the cacert value to a local file `cacert.b64`. This value should be used in your uds-config/bundle to configure the tenant and admin gateways appropriately.
