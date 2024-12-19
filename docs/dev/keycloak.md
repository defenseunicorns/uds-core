# Keycloak Azure Identity Provider Setup

## Prerequisites

* Entra Identity Provider Configured [(docs here)](./entra-integration.md)
* Kubernetes Cluster deployed
* UDS Core Deployed and Keycloak Admin Console accessible
    * should add docs for what bundle overrides will be needed
        * banner overrides
        * authentication for idp only override
        * other???

## What's Being Configured:
* add docs here

## Manual Configuration Steps:
### Getting Started
* Log into Keycloak Admin UI
    * `keycloak.admin.< domain >`
    * The Keycloak admin username and password varies based on how UDS Core is deployed
        * If deploying with the bundle override `INSECURE_ADMIN_PASSWORD_GENERATION`
            * The username will be `admin` and the password will be in a Kubernetes secret called `keycloak-admin-password`
        * If **not** deploying with bundle override
            * An admin user will need to be registered by using `zarf connect keycloak`
            * This temporary admin user is recommended to be removed later

![Keycloak Admin Login Page](https://github.com/defenseunicorns/uds-core/blob/main/docs/.images/dev/keycloak-admin-login-page.png?raw=true)

* Both Master and UDS Realms should be created by deploying UDS Core
    * Verify this in the Top Left dropdown
### Master Realm
1. Configure the Required Actions
    1. disable required actions
1. Configure User Groups and Realm Roles
    1. create group
    1. assign group to realm admin role
1. Configure the SAML Identity Provider for Azure
    1. create saml 2.0 idp
    1. configure the idp with these settings
    1. add the mappers
1. Configure Authentication Flows and default Browser Flow
1. (OPTIONAL) - Configure a Client for service account authentication
1. FINALLY - remove the temporary keycloak admin user after verifying that idp allows for new admin user registration
### UDS Realm
1. Configure the SAML Identity Provider for Azure
    1. create saml2.0 idp
    1. configure the idp with these settings
    1. add the mappers


