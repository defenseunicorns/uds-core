# Keycloak Azure Entra Identity Provider Setup

## Prerequisites

* Entra Identity Provider Configured [(docs here)](./entra-integration.md)
* Kubernetes Cluster deployed
* UDS Core Deployed and Keycloak Admin Console accessible

## Manual Configuration Steps:
### Getting Started
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
            5. Enter key `http://schemas.microsoft.com/ws/2008/06/identity/claims/groups` and value `03dd22d4-ff8e-44e4-aa7f-effc2f303be2` ( this is the id from the group created in Entra for admin users only )
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
    4. Should be on `Authentication` page
    5. Find the newly created `browser-idp-redirect` Authentication Flow
    6. Select the three dots at the *far right of the row*
    7. Select the `Bind flow` option
    8. Select the `Browser flow` from the dropdown and click `Save`

    * We have created an Identity Provider and we have disabled the use of username passwords for admin users. So we need to disable the final route for admin users to utilize those passwords. Since we are shifting authentication to Entra, we setup an Authentication flow that automatically redirects users to Entra when they need to login or register. This mitigates both confusion and misconfigurations.

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
    10. Toggle `Direct access grants` to `Off`
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
    4. Should experience some redirects and land on Entra Login page
    5. Enter Entra Users information
    6. Should be redirected to the Admin UI again with full permissions

7. FINALLY - Remove Temporary Admin User
    1. When configuration of Keycloak is complete it's recommended to remove the admin user that was initial created
    2. Select `Users` tab from *left side nav bar* under *Manage*
    3. This next step will remove you from Keycloak if you're still using the temp admin user
    4. Select the three dots from the *far right of admin row*
    5. Select `Delete`

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
        4. Select the `Add mapper`
            1. Change `Name` field to `Admin Group Mapper`
            2. Change `Sync mode override` field to `Force`
            3. Change `Mapper type` field to `Advanced Attribute to Group`
            4. Select `Add Attributes` from *middle of page*
            5. Enter key `http://schemas.microsoft.com/ws/2008/06/identity/claims/groups` and value `03dd22d4-ff8e-44e4-aa7f-effc2f303be2` ( this is the id from the group created in Entra for admin users only )
            6. Select `Select group` button
            7. Select `/UDS Core/Admin` from the pop up window and click `Select`
            8. Select `Save` and navigate back to `Provider details` via the breadcrumbs at *top of page*
        5. Select the `Add mapper`
            1. Change `Name` field to `Auditor Group Mapper`
            2. Change `Sync mode override` field to `Force`
            3. Change `Mapper type` field to `Advanced Attribute to Group`
            4. Select `Add Attributes` from *middle of page*
            5. Enter key `http://schemas.microsoft.com/ws/2008/06/identity/claims/groups` and value `03dd22d4-ff8e-44e4-aa7f-effc2f303be2` ( this is the id from the group created in Entra for admin users only )
            6. Select `Select group` button
            7. Select `/UDS Core/Auditor` from the pop up window and click `Select`
            8. Select `Save` and navigate back to `Provider details` via the breadcrumbs at *top of page*

2. Testing
    1. Navigate to `sso.< domain >`
    2. Select the `Azure SSO`
    3. Go through Entra Login
    4. Should be able to access Keycloak Account UI
