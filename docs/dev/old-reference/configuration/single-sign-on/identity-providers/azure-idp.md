---
title: Azure Entra ID
---

This guide will walk you through the steps required to configure Azure Entra ID as a SAML identity provider in Keycloak.

## Prerequisites
- Access to your Azure Entra ID Tenant, with at least [Cloud Application Administrator](https://learn.microsoft.com/en-us/entra/identity/role-based-access-control/permissions-reference#cloud-application-administrator) Privileges.
- Existing Entra ID Groups that are designated for Administrators and Auditors of UDS Core Applications (see note below).
- **VERY IMPORTANT** Users configured in Entra are **REQUIRED** to have an email address defined, without this Keycloak will fail to create the user.

> UDS Core comes with two preconfigured user groups in Keycloak: `Admin` and `Auditor`. These groups are assigned roles to the various applications deployed by UDS Core, outlined [here](/reference/configuration/single-sign-on/overview/#user-groups). Using [Identity Provider Mappers](https://www.keycloak.org/docs/latest/server_admin/#_mappers) in Keycloak, we can map your existing Administrator and Auditor groups in Azure Entra ID to the `Admin` and `Auditor` groups in Keycloak. See [User Groups](/reference/configuration/single-sign-on/overview/#user-groups) for more details.

## Creating Application Registrations in Azure Entra ID
In this section, we will configure Application Registrations for each Keycloak realm deployed with UDS Core - the default `master` realm and the `uds` realm. The two App Registrations should be nearly identical, with the main difference being their `Redirect URI`.

### Create App Registration - Master Realm
1. In Azure Entra ID, navigate to the "App registrations" page under "Manage".
1. Click "New registration".
1. Input a name for the application.
1. Under "Supported Account Types", select "Accounts in this organizational directory (<Your tenant name> only - Single tenant)".
1. Under "Redirect URI", select "Web" from the drop down menu and then input the following as the URL: `https://keycloak.<admin_domain>/realms/master/broker/azure-saml/endpoint`.
1. Click "Register" when done.

![Creating Master Realm App Registration](https://github.com/defenseunicorns/uds-core/blob/main/docs/.images/sso/azure-idp-create-app-master.jpg?raw=true)

Once created, you will be directed to your application's configuration page in Entra ID. Follow the steps below to configure the App Registration:
1. On the left-hand side, navigate to "Manage" > "Token configuration". Here you will need to add the following as "Optional claims":

   | Claim    | Token Type |
   |----------|------------|
   | `acct`   | SAML       |
   | `email`  | SAML       |
   | `ipaddr` | ID         |
   | `upn`    | SAML       |

> When adding these claims, a dialogue box will appear that says "Some of these claims (email, upn) require OpenID Connect scopes to be configured through the API permissions page or by checking the box below.". Select the checkbox that says "Turn on the Microsoft Graph email, profile permission (required for claims to appear in token). Click "Add".

1. You will also need to add a "Groups claim" as follows:
    1. Select "All groups" under "Select group types to include in Access, ID, and SAML tokens." Accept the default values for the rest.
    1. Click "Add" when done.

![Token Configuration](https://github.com/defenseunicorns/uds-core/blob/main/docs/.images/sso/azure-idp-token-configuration.jpg?raw=true)

1. Next, Navigate to "Expose an API" under "Manage"
1. On the top of the page, you will see "Application ID URI". Click "Add".
1. The window that appears should automatically populate with `api://<Application (Client ID)>`. Note this value. You will need it for configuring the Azure SAML Identity Provider in Keycloak later.
1. Click "Save".

### Create App Registration - UDS Realm
Repeat the steps above to create a new App Registration for the UDS Realm. Note the following caveats below:
1. When you get to step 3, ensure that you provide the Application Registration a unique name.
1. When asked to provide a "Redirect URI", provide the following: `https://sso.<domain>/realms/uds/broker/azure-saml/endpoint`
1. Continue with next steps.

## Keycloak Azure Entra Identity Provider Setup
* Log into Keycloak Admin UI
    * `keycloak.< admin_domain >`
    * The Keycloak admin username and password varies based on how UDS Core is deployed
        * If deploying with the bundle override `INSECURE_ADMIN_PASSWORD_GENERATION`
            * The username will be `admin` and the password will be in a Kubernetes secret called `keycloak-admin-password`
        * If **not** deploying with bundle override
            * An admin user will need to be registered by using `zarf connect keycloak`
            * This temporary admin user is recommended to be removed later

* Both Master and UDS Realms should be created by deploying UDS Core
    * Verify this in the *Top Left* dropdown

### Master Realm
1. Configure the Required Actions
    1. Select `Authentication` tab from *left side nav bar* under *Configure*
    2. Select `Required actions` tab from *top nav bar*
    3. Now disable all required actions

    * These required actions are configurations that every user registered to the Master realm will need to complete, even if they register via an Identity Provider like Entra. This can add unnecessary checks that a user will need to configure when they register. Since we are shifting all authorization to Azure Entra, these will be repetitive validations.

2. Configure User Groups and Realm Roles
    1. Select `Groups` tab from *left side nav bar* under *Manage*
    2. Select `Create Group` button in the *middle of the page*
    3. Name that group `admin-group` and select the `Create` button
    4. Select the newly created `admin-group`, this will open a `Group details` page
    5. Select `Role Mapping` tab from *top nav bar*
    6. Select `Assign role` button in the *middle of the page*
    7. On the pop up page, Select the `Filter by clients` dropdown in the *top left* and select `Filter by realm roles`
    8. This should be a much smaller list, now toggle the `admin` role and click `Assign` in the *bottom left corner*

    * This creates a Master Realm specific group for admin users to be put into when they register. This group will be mapped from the Entra user into Keycloak. This group gives the admin users complete control, if the admin users should not have those controls then creating a different role with the reuiqred controls would be necessary and a group that is connected to that role.

3. Configure the SAML Identity Provider for Azure
    1. Select `Identity Providers` tab from *left side nav bar* under *Manage*
    2. Select `SAML v2.0` option from *middle of page* under `User-defined`
        1. Should be on a new page called `Add SAML provider` now
        2. Change the `Alias` field to `azure-saml`
        3. Change the `Display name` field to `Azure SSO`
        4. Get the `Service provider entity ID` from the Entra portal:
            1. Entra - App Registrations
            2. Select Application from list for master realm
            3. Copy the `Application ID URI and copy that the `Service provider entity ID` in the Keycloak Identity Provider creation
        5. Get the `SAML entity descriptor` from the Entra portal:
            1. Entra - App Registrataions
            2. Select Application from list for master realm
            3. Select the `Endpoints` tab from *top nav bar*
            4. Copy the `Federation metadata document` endpoint over to the `SAML entity descriptor` in the Keycloak Identity Provider creation, make sure that it gets the green checkmark
        6. Select `Add` button, should now see an Azure SSO page that has been auto populated
        7. Toggle `Backchannel logout` to `On` under `SAML Settings`
        8. Toggle `Trust Email` to `On` under `Advanced settings`
        9. Change the `First login flow override` under `Advanced settings` to be `first broker login`
        10. Select `Save`

    3. Select `Mappers` tab from *top nav bar*
        1. Select `Add mapper`, should now be on `Add Identity Provider Mapper` page
            1. Change `Name` field to `Username Mapper`
            2. Change `Sync mode override` field to `Force`
            3. Change `Mapper type` field to `Attribute Importer`
            4. Change `Attribute Name` field to `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress`
            5. Change `User Attribute Name` in the dropdown field to `username`
            6. Select `Save` and navigate back to `Provider details` via the breadcrumbs at *top of page*
        2. Select the `Add mapper`
            1. Change `Name` field to `First Name Mapper`
            2. Change `Sync mode override` field to `Force`
            3. Change `Mapper type` field to `Attribute Importer`
            4. Change `Attribute Name` field to `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname`
            5. Change `User Attribute Name` in the dropdown field to `firstName`
            6. Select `Save` and navigate back to `Provider details` via the breadcrumbs at *top of page*
        3. Select the `Add mapper`
            1. Change `Name` field to `Last Name Mapper`
            2. Change `Sync mode override` field to `Force`
            3. Change `Mapper type` field to `Attribute Importer`
            4. Change `Attribute Name` field to `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname`
            5. Change `User Attribute Name` in the dropdown field to `lastName`
            6. Select `Save` and navigate back to `Provider details` via the breadcrumbs at *top of page*
        4. Select the `Add mapper`
            1. Change `Name` field to `Email Mapper`
            2. Change `Sync mode override` field to `Force`
            3. Change `Mapper type` field to `Attribute Importer`
            4. Change `Attribute Name` field to `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress`
            5. Change `User Attribute Name` in the dropdown field to `email`
            6. Select `Save` and navigate back to `Provider details` via the breadcrumbs at *top of page*
        4. Select the `Add mapper`
            1. Change `Name` field to `Group Mapper`
            2. Change `Sync mode override` field to `Force`
            3. Change `Mapper type` field to `Advanced Attribute to Group`
            4. Select `Add Attributes` from *middle of page*
            5. Enter key `http://schemas.microsoft.com/ws/2008/06/identity/claims/groups` and value is in the Entra `Manage Groups`, Pick the admin group and copy the Group ID into the value field
            6. Select `Select group` button
            7. Select `admin-group` from the pop up window and click `Select`
            8. Select `Save` and navigate back to `Provider details` via the breadcrumbs at *top of page*

        * This creates mappers for mapping users information between Entra and Keycloak. While not absolutely necessary there is many reasons why this is a good idea. Make sure the Entra group that is for admins is very restrictive and only users that should have control of keycloak are admitted.

4. Configure Authentication Flows and default Browser Flow
    1. Select `Authentication` from *left side nav bar* under *Configure*
    2. Select `Create Flow` from *top nav bar*, should be on `Create flow` page now
        1. Change `Name` to `browser-idp-redirect`
        2. Select `Create`, should be on `browser-idp-redirect` page now, this is not in use yet
        3. Select `Add an execution`
        4. In the search bar enter `redirector` and select the `Identity Provider Redirector`, and click `Add`
        5. Change the requirement dropdown to `REQUIRED`
        6. Select the gear settings icon
        7. Change `Alias` to `Browser IDP`
        8. Change `Default Identity Provider` to `azure-saml`
    3. Select the `Authentication` breacrumb at the *top of the page*

    * We have created an Identity Provider and we have disabled the use of username passwords for admin users. So we need to disable the final route for admin users to utilize those passwords.

5. OPTIONAL but recommended - Configure a Client for service account authentication
    1. Select `Clients` from *left side nav bar* under *manage*
    2. Select `Create client` from *top nav bar*
    3. Change `Client ID` field to `service-client`
    4. Change `Name` field to `Service Client`
    5. Change `Description` field to `Service Account Enabled Client`
    6. Select `Next` button from *bottom of page*
    7. Toggle `Client authentication` to `On`
    8. Toggle `Standard flow` to `Off`
    9. Toggle `Direct access grants` to `Off`
    10. Toggle `Service account roles` to `On`
    11. Select `Next` button from *bottom of page*
    12. Select `Save` button from *bottom of page*
    13. Should be on the `service-client` client details page now
    14. Select the `Service accounts roles` tab from *top nav bar*
    15. Select `Assign role`
    16. Switch the `Filter by clients` dropdown to `Filter by realm roles`
    17. Select the `admin` role and click `Assign` at *bottom of pop up*

    * This step creates a Keycloak client that can only be used via service accounts. This means things like Terraform or otherwise. Instead of providing a users credentials to run terraform against keycloak, the client_id and client_secret could be used instead. The `client_id` can be found on the client details page and the `client_secret` can be found in the `Credentials` tab of the client. This is not necessary but can provide another avenue to manage day 2 ops for Keycloak.

6. Testing Changes

   **This requires that user be setup in Entra and have the correct group defined in Entra that maps to the Keycloak admin group created earlier**

    1. We would recommend testing all of these changes at this point to verify functionality of Authentication flows
    2. Select the `Admin` user drop down from *top right corner of screen*
    3. Select `sign out`
    4. Should be redirected to a Keycloak login screen where Username/Password is enabled and an `Azure SSO` option is present

    * We will disable the Username/Password Authentication Flow after we've tested that everything is working otherwise if anything is misconfigured, you won't be able to get back in and will have to start this process over again.

    5. Select the `Azure SSO` option
    6. Should experience some redirects and land on Entra Login page
    7. Enter Entra Users information
    8. Should be redirected to the Admin UI again with full permissions

7. FINALLY
    1. When configuration of Keycloak is complete and everything is working, do these final steps:
    2. Disable Username Password Auth
        1. Select `Authentication` from *left side nav bar* under *Configure*
        2. Find the newly created `browser-idp-redirect` Authentication Flow
        3. Select the three dots at the *far right of the row*
        4. Select the `Bind flow` option
        5. Select the `Browser flow` from the dropdown and click `Save`

        * Since we are shifting authentication to Entra, we setup an Authentication flow that automatically redirects users to Entra when they need to login or register. This mitigates both confusion and misconfigurations.

    1. Remove the admin user that was initial created
        1. Select `Users` tab from *left side nav bar* under *Manage*
        2. This next step will remove you from Keycloak if you're still using the temp admin user
        3. Select the three dots from the *far right of admin row*
        4. Select `Delete`

        * This user is a requirement for keycloak to be accessed and configured the very first time. So by default this user is a super user and should be removed so that a user cannot assume the admin users creds.

### UDS Realm
1. Configure the SAML Identity Provider for Azure
    1. Select `Identity Providers` tab from *left side nav bar* under *Manage*
    2. Select `SAML v2.0` option from *middle of page* under `User-defined`
        1. Should be on a new page called `Add SAML provider` now
        2. Change the `Alias` field to `azure-saml`
        3. Change the `Display name` field to `Azure SSO`
        4. Get the `Service provider entity ID` from the Entra portal:
            1. Entra - App Registrations
            2. Select Application from list for master realm
            3. Copy the `Application ID URI` and copy that the `Service provider entity ID` in the Keycloak Identity Provider creation
        5. Get the `SAML entity descriptor` from the Entra portal:
            1. Entra - App Registrataions
            2. Select Application from list for master realm
            3. Select the `Endpoints` tab from *top nav bar*
            4. Copy the `Federation metadata document` endpoint over to the `SAML entity descriptor` in the Keycloak Identity Provider creation, make sure that it gets the green checkmark
        6. Select `Add` button, should now see an Azure SSO page that has been auto populated
        7. Toggle `Backchannel logout` to `On` under `SAML Settings`
        8. Toggle `Trust Email` to `On` under `Advanced settings`
        9. Change the `First login flow override` under `Advanced settings` to be `first broker login`
        10. Select `Save`

    3. Select `Mappers` tab from *top nav bar*
        1. Select `Add mapper`, should now be on `Add Identity Provider Mapper` page
            1. Change `Name` field to `Username Mapper`
            2. Change `Sync mode override` field to `Force`
            3. Change `Mapper type` field to `Attribute Importer`
            4. Change `Attribute Name` field to `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress`
            5. Change `User Attribute Name` in the dropdown field to `username`
            6. Select `Save` and navigate back to `Provider details` via the breadcrumbs at *top of page*
        2. Select the `Add mapper`
            1. Change `Name` field to `First Name Mapper`
            2. Change `Sync mode override` field to `Force`
            3. Change `Mapper type` field to `Attribute Importer`
            4. Change `Attribute Name` field to `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname`
            5. Change `User Attribute Name` in the dropdown field to `firstName`
            6. Select `Save` and navigate back to `Provider details` via the breadcrumbs at *top of page*
        3. Select the `Add mapper`
            1. Change `Name` field to `Last Name Mapper`
            2. Change `Sync mode override` field to `Force`
            3. Change `Mapper type` field to `Attribute Importer`
            4. Change `Attribute Name` field to `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname`
            5. Change `User Attribute Name` in the dropdown field to `lastName`
            6. Select `Save` and navigate back to `Provider details` via the breadcrumbs at *top of page*
        4. Select the `Add mapper`
            1. Change `Name` field to `Email Mapper`
            2. Change `Sync mode override` field to `Force`
            3. Change `Mapper type` field to `Attribute Importer`
            4. Change `Attribute Name` field to `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress`
            5. Change `User Attribute Name` in the dropdown field to `email`
            6. Select `Save` and navigate back to `Provider details` via the breadcrumbs at *top of page*
        5. Select the `Add mapper`
            1. Change `Name` field to `Admin Group Mapper`
            2. Change `Sync mode override` field to `Force`
            3. Change `Mapper type` field to `Advanced Attribute to Group`
            4. Select `Add Attributes` from *middle of page*
            5. Enter key `http://schemas.microsoft.com/ws/2008/06/identity/claims/groups` and value is in the Entra `Manage Groups`, Pick the admin group and copy the Group ID into the value field
            6. Select `Select group` button
            7. Select `/UDS Core/Admin` from the pop up window and click `Select`
            8. Select `Save` and navigate back to `Provider details` via the breadcrumbs at *top of page*
        6. Select the `Add mapper`
            1. Change `Name` field to `Auditor Group Mapper`
            2. Change `Sync mode override` field to `Force`
            3. Change `Mapper type` field to `Advanced Attribute to Group`
            4. Select `Add Attributes` from *middle of page*
            5. Enter key `http://schemas.microsoft.com/ws/2008/06/identity/claims/groups` and value is in the Entra `Manage Groups`, Pick the auditor group and copy the Group ID into the value field
            6. Select `Select group` button
            7. Select `/UDS Core/Auditor` from the pop up window and click `Select`
            8. Select `Save` and navigate back to `Provider details` via the breadcrumbs at *top of page*

## Testing
1. Navigate to `sso.< domain >`
2. Select the `Azure SSO`
3. Go through Entra Login
4. Should be able to access Keycloak Account UI

## References
- [Quickstart: Register an application with the Microsoft identity platform](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app?tabs=certificate)
- [Enable single sign-on for an enterprise application](https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/add-application-portal-setup-sso)