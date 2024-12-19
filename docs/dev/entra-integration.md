---
title: Integrating Azure Entra ID as a SAML Identity Provider within Keycloak
---

UDS Core deploys KeyCloak for Identity and Access Management (IAM). Keycloak provides centralized authentication, enabling single sign-on (SSO) and role-based access control (RBAC) to restrict access to authorized users. You may wish to integrate another identity provider with Keycloak so that your existing user base can access applications within UDS Core. This guide will walk you through the steps required to configure Azure Entra ID as a SAML identity provider in Keycloak.

## Prerequisites

- Access to your Azure Entra ID Tenant, with at least [Cloud Application Administrator](https://learn.microsoft.com/en-us/entra/identity/role-based-access-control/permissions-reference#cloud-application-administrator) Privileges.
- Existing Entra ID Groups that are designated for Administrators and Auditors of UDS Core Applications (see note below).

:::note
UDS Core comes with two preconfigured user groups in Keycloak: `Admin` and `Auditor`. These groups are assigned roles to the various applications deployed by UDS Core, outlined [here](https://uds.defenseunicorns.com/reference/configuration/uds-user-groups/). Using [Identity Provider Mappers](https://www.keycloak.org/docs/latest/server_admin/#_mappers) in Keycloak, we can map your existing Administrator and Auditor groups in Azure Entra ID to the `Admin` and `Auditor` groups in Keycloak.
:::

### Create Enterprise Application
In Azure Entra ID, navigate to the "Enterprise Applications" page under "Manage". Click "New application", followed by "Create your own application". Input a name for the application and then select "Integrate any other application you don't find in the gallery (Non-gallery)."
[Creating Enterprise Application](https://github.com/defenseunicorns/uds-core/blob/main/docs/.images/create-application.jpg)

Click "Create" when done.

When finished, you will be directed to your application's configuration page in Entra ID. On the left-hand side, navigate to "Manage" > "Single sign-on". Various methods for configuring single sign-on will be shown. Select "SAML". Enter a unique value for `Identifier (Entity ID)`. 

#### References
- [Quickstart: Register an application with the Microsoft identity platform](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app?tabs=certificate)
- [Enable single sign-on for an enterprise application](https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/add-application-portal-setup-sso)