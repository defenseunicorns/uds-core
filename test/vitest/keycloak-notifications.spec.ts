/**
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import * as net from "net";
import * as crypto from "crypto";
import { afterAll, beforeAll, describe, test } from "vitest";
import { closeForward, getForward } from "./helpers/forward";
import { expectAlertFires } from "./helpers/alertmanager";
import {
  getAdminToken,
  createRandomClient,
  createRandomUserAndJoinGroup,
  createUser,
} from "./helpers/keycloak";

let alertmanagerProxy: { server: net.Server; url: string };
let prometheusProxy: { server: net.Server; url: string };
let keycloakProxy: { server: net.Server; url: string };

const testTimeoutMs = 5 * 60 * 1000; // 5 minutes timeout for the test

describe("integration - Keycloak Notifications", () => {
  beforeAll(async () => {
    alertmanagerProxy = await getForward("kube-prometheus-stack-alertmanager", "monitoring", 9093);
    prometheusProxy = await getForward("kube-prometheus-stack-prometheus", "monitoring", 9090);
    keycloakProxy = await getForward("keycloak-http", "keycloak", 8080);
  });

  afterAll(async () => {
    await closeForward(alertmanagerProxy.server);
    await closeForward(prometheusProxy.server);
    await closeForward(keycloakProxy.server);
  });

  test(
    "Keycloak Alerts should fire on Realm Modifications",
    async () => {
      // At first, we need to trigger some Realm and User modification events.
      const accessToken = await getAdminToken(keycloakProxy.url);

      const randomUdsRealmClientId = `keycloak-notifications-test-${crypto.randomBytes(6).toString("base64url")}`;
      await createRandomClient(keycloakProxy.url, accessToken, randomUdsRealmClientId, "uds");

      const randomMasterRealmClientId = `keycloak-notifications-test-${crypto.randomBytes(6).toString("base64url")}`;
      await createRandomClient(keycloakProxy.url, accessToken, randomMasterRealmClientId, "master");

      const randomUdsRealmUsername = `keycloak-notifications-test-${crypto.randomBytes(6).toString("base64url")}`;
      await createRandomUserAndJoinGroup(
        keycloakProxy.url,
        accessToken,
        randomUdsRealmUsername,
        "/UDS Core/Admin",
        "uds",
      );

      const randomMasterRealmUsername = `keycloak-notifications-test-${crypto.randomBytes(6).toString("base64url")}`;
      await createUser(keycloakProxy.url, accessToken, randomMasterRealmUsername, "master");

      // Next, we wait until the alerts fire
      await expectAlertFires(alertmanagerProxy.url, "KeycloakUDSRealmModificationsDetected");
      await expectAlertFires(alertmanagerProxy.url, "KeycloakMasterRealmModificationsDetected");
      await expectAlertFires(alertmanagerProxy.url, "KeycloakUDSUserModificationsDetected");
      await expectAlertFires(alertmanagerProxy.url, "KeycloakUDSSystemAdminModificationsDetected");
      await expectAlertFires(
        alertmanagerProxy.url,
        "KeycloakMasterSystemAdminModificationsDetected",
      );
    },
    testTimeoutMs,
  );
});
