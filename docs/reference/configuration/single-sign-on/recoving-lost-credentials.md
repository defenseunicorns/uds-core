---
title: Recovering lost Keycloak credentials
---

<!-- @lulaStart feeffdc0-3ecb-45b2-a7f7-46519b629472 -->
This procedure describes how to recover lost Keycloak credentials for UDS Core. It leverages the [Admin bootstrap and recovery](https://www.keycloak.org/server/bootstrap-admin-recovery) feature of Keycloak and works only when an external database (like PostgreSQL) is used. 

:::caution
This procedure requires at least 1.5G of memory allocated to the Keycloak container. You may need to temporarily increase the memory limit before starting the recovery process. If the `JAVA_OPTS_KC_HEAP` environment variable is used, ensure the -XX:MaxRAM setting corresponds to the container memory limits. More information might be found at Keycloak's part of the [UDS Prerequisites manual](/reference/uds-core/prerequisites/).
:::

:::caution
If your account has been locked out after the FIPS migration, you may want to move back to non-FIPS mode and follow the [Upgrading Identity Config Versions](https://uds.defenseunicorns.com/reference/uds-core/idam/upgrading-versions/) guide. This way you won't need to recover your administrator credentials. 
:::

The procedure involves creating a new user with administrator privileges, logging into that user, recovering the lost credentials and deleting it. First, create a new temporary admin user called `temp-admin` with a strong password:

```bash
uds zarf tools kubectl exec -it keycloak-0 -n keycloak -- /opt/keycloak/bin/kc.sh bootstrap-admin user --verbose --optimized --http-management-port=9001
```

When prompted, enter the `temp-admin` password:

```bash
Enter username [temp-admin]: <enter>
Enter password: <temp-admin password>
Enter password again: <temp-admin password>
```

The command will exit with no errors. Ensure this line is present in the output:

```bash
<timestamp> INFO  [org.keycloak.services] (main) KC-SERVICES0077: Created temporary admin user with username temp-admin
```

Navigate to https://keycloak.admin.uds.dev/ and log in with the `temp-admin` user. Once logged in, reset the admin user password by navigating to the `Users` tab, selecting `admin`, going to the `Credentials` tab, and clicking on `Reset Password`. Once the `admin` password has been updated, delete the `temp-admin` user.
<!-- @lulaEnd feeffdc0-3ecb-45b2-a7f7-46519b629472 -->
