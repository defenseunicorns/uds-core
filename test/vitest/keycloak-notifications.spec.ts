/**
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import * as net from "net";
import * as crypto from "crypto";
import { afterAll, beforeAll, describe, test } from "vitest";
import { closeForward, getForward } from "./helpers/forward";
import { expectAlertFires } from "./helpers/alertmanager";
import { getAdminToken, createRandomClient, createRandomUserAndJoinGroup } from "./helpers/keycloak";

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

      const randomClientId = `keycloak-notifications-test-${crypto.randomBytes(6).toString("base64url")}`;
      await createRandomClient(keycloakProxy.url, accessToken, randomClientId, "uds");

      const randomUsername = `keycloak-notifications-test-${crypto.randomBytes(6).toString("base64url")}`;
      await createRandomUserAndJoinGroup(keycloakProxy.url, accessToken, randomUsername, "/UDS Core/Admin", "uds");

      // Next, we wait until the alerts fire
      await expectAlertFires(alertmanagerProxy.url, "KeycloakRealmModificationsDetected");
      await expectAlertFires(alertmanagerProxy.url, "KeycloakUserModificationsDetected");
      await expectAlertFires(alertmanagerProxy.url, "KeycloakSystemAdminModificationsDetected");
    },
    testTimeoutMs,
  );
});


