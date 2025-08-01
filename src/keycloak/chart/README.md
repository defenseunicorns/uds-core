# Keycloak

[Keycloak](http://www.keycloak.org/) is an open source identity and access management for modern applications and services.

## Introduction

This chart bootstraps a [Keycloak](http://www.keycloak.org/) StatefulSet on a [Kubernetes](https://kubernetes.io) cluster using the [Helm](https://helm.sh) package manager.
It provisions a fully featured Keycloak installation.
For more information on Keycloak and its capabilities, see its [documentation](http://www.keycloak.org/documentation.html).

### Dev Mode

When `devMode: true` is set, the chart will deploy a single Keycloak Pod with an in-memory database and scaling turned off. Dev Mode also leverages PVCs by default for `data` and `themes`.

Using an external database with Dev Mode enabled is not supported.

Dev Mode enables debug logging for Keycloak. To configure debug logging outside of Dev Mode, set `debugMode: true` in your values.

### Autoscaling

The example autoscaling configuration in the values file scales from three up to a maximum of ten Pods using CPU utilization as the metric. Scaling up is done as quickly as required but scaling down is done at a maximum rate of one Pod per five minutes.

Autoscaling can be enabled as follows:

```yaml
autoscaling:
  enabled: true
```

### Admin User Creation

To be able to access the Keycloak administrative console you must create an initial admin user. You can do this using `zarf connect keycloak` which will launch a port-forward session to Keycloak. From there you will be prompted for the initial admin username and password.

If you are unable to open a browser to create this user (i.e. a headless install), the chart provides values under `insecureAdminPasswordGeneration` which will generate the initial admin user for you and place the password in a secret (`keycloak-admin-password`) in cluster. To use this set `insecureAdminPasswordGeneration.enabled` to `true`, and (optionally) set `insecureAdminPasswordGeneration.username` to the desired username.

Note that this is highly discouraged as it is often used as a shared admin account rather than a being tied to a specific user. If you do use this toggle, you should immediately change the password after initial login so that your admin account information is not exposed in the cluster secret. This secret will only contain the initial password and will not be updated after you change the password during initial login.

## Why StatefulSet?

The chart sets node identifiers to the system property `jboss.node.name` which is in fact the pod name.
Node identifiers must not be longer than 23 characters.
This can be problematic because pod names are quite long.
We would have to truncate the chart's fullname to six characters because pods get a 17-character suffix (e. g. `-697f8b7655-mf5ht`).
Using a StatefulSet allows us to truncate to 20 characters leaving room for up to 99 replicas, which is much better.
Additionally, we get stable values for `jboss.node.name` which can be advantageous for cluster discovery.
The headless service that governs the StatefulSet is used for DNS discovery via DNS_PING.
