## Keycloak

[Keycloak](https://www.keycloak.org/) is an open source IdAM stack written in Java. This Keycloak source package provides an implementation of Keycloak and is intended to be used in conjunction with the [UDS Identity Config](https://github.com/defenseunicorns/uds-identity-config) image and the [UDS Operator](../pepr/operator/README.md).

### Changes from the DoD Platform One Big Bang package

This package differs from the [DoD Platform One Big Bang package](https://repo1.dso.mil/big-bang/product/packages/keycloak) in a few key ways:

- No default admin user is created for any realm. In order to administer this instance, you must use `zarf connect keycloak` to establish the global admin account.
- TLS termination is performed by Istio via the [OPTIONAL_MUTUAL TLS config](https://istio.io/latest/docs/reference/config/networking/gateway/#ServerTLSSettings-TLSmode) to enable proper Istio traffic management and multi-point mTLS validation.
- The Keycloak instance is configured to use the [UDS Identity Config](https://github.com/defenseunicorns/uds-identity-config) image, which is a custom image that contains all the customizations needed for UDS including the core custom Keycloak plugin, custom themes, realm initialization, and PKI trust store.
- The [UDS Operator](../pepr/operator/README.md) is used to declaratively manage Keycloak clients without any global admin-level credentials stored in the cluster.
- The [P1 Quarkus java plugin](https://repo1.dso.mil/big-bang/product/plugins/keycloak-p1-auth-plugin/-/tree/main/quarkus-ext-routing?ref_type=heads) has been replaced with Istio logic.
- The [P1 Java plugin](https://repo1.dso.mil/big-bang/product/plugins/keycloak-p1-auth-plugin) group restrictions and yaml config have been removed and replaced with Istio logic.
- The [unofficial helm chart](https://github.com/codecentric/helm-charts/tree/master/charts/keycloak) from German company Codecentric has been rewritten, simplified in this repo by Defense Unicorns.
- By default, this package deploys Keycloak in "dev mode", which disables HA and uses an H2 database persisted to a PVC. This is not suitable for production use, but is useful for development and testing. Dev mode also makes development and testing easier by increasing debug logs and disabling caching. Setting the helm value `devMode` to `false` will enable HA and use a PostgreSQL database, you must include credentials for a PostgreSQL database in the `keycloak` chart values.

### Customizing Keycloak

For using custom Java plugins, custom themes (beyond just the client name/image), custom initial realm config or custom PKI trust stores, see the [UDS Identity Config](https://github.com/defenseunicorns/uds-identity-config) repo, which contains all the tools you need to build your own custom config image. If using that repo, the only change to make to UDS Core is to update the `configImage` Helm value in the keycloak chart. This repo also contains very UDS tasks that make working with custom versions of the identity config image easier.

_Note: if you are updating the PKI trust store, you'll also need to update the Istio config. the task `uds run -f src/keycloak/tasks.yaml cacert --set IMAGE_NAME=<your config image> --set VERSION=<your image version>` can be used to help you generate the `cacert.b64` file. This contains the `tls.cacert` value you will need to override in the Istio chart config chart._
