/**
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import * as crypto from "crypto";
import * as net from "net";
import { afterAll, beforeAll, describe, test } from "vitest";
import { expectAlertFires } from "./helpers/alertmanager";
import { closeForward, getForward } from "./helpers/forward";
import {
  createRandomClient,
  createRandomUserAndJoinGroup,
  createUser,
  getAdminToken,
} from "./helpers/keycloak";

let alertmanagerProxy: { server: net.Server; url: string };
let prometheusProxy: { server: net.Server; url: string };
let keycloakProxy: { server: net.Server; url: string };

const testTimeoutMs = 5 * 60 * 1000; // 5 minutes timeout for the test
const hookTimeoutMs = 60 * 1000; // 1 minute for hook timeout (realm/user changes)

describe("integration - Keycloak Notifications", () => {
  beforeAll(async () => {
    alertmanagerProxy = await getForward("kube-prometheus-stack-alertmanager", "monitoring", 9093);
    prometheusProxy = await getForward("kube-prometheus-stack-prometheus", "monitoring", 9090);
    keycloakProxy = await getForward("keycloak-http", "keycloak", 8080);

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
  }, hookTimeoutMs);

  afterAll(async () => {
    await closeForward(alertmanagerProxy.server);
    await closeForward(prometheusProxy.server);
    await closeForward(keycloakProxy.server);
  });

  test(
    "Keycloak Alerts should fire on Realm Modifications",
    async () => {
      await expectAlertFires(alertmanagerProxy.url, "KeycloakRealmModificationsDetected");
    },
    testTimeoutMs,
  );

  test(
    "Keycloak Alerts should fire on User Modifications",
    async () => {
      await expectAlertFires(alertmanagerProxy.url, "KeycloakUserModificationsDetected");
    },
    testTimeoutMs,
  );

  test(
    "Keycloak Alerts should fire on System Administrators Modifications",
    async () => {
      await expectAlertFires(alertmanagerProxy.url, "KeycloakSystemAdminModificationsDetected");
    },
    testTimeoutMs,
  );
});
