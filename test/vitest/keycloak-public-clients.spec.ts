/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s, kind } from "pepr";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { UDSPackage } from "../../src/pepr/operator/crd";

const TEST_NS = "public-clients-test";

const failIfReached = () => expect(true).toBe(false);

describe("integration - ALLOW_PUBLIC_CLIENTS admission gate (default off)", () => {
  beforeAll(async () => {
    await K8s(kind.Namespace).Apply({
      metadata: {
        name: TEST_NS,
        labels: {
          "istio-injection": "disabled",
          "zarf.dev/agent": "ignore",
        },
      },
    });
  });

  afterAll(async () => {
    await K8s(kind.Namespace).Delete(TEST_NS);
  });

  // This test only covers the negative (default) case — the UDS Operator should
  // reject a non-device-flow public client when ALLOW_PUBLIC_CLIENTS is "false".
  //
  // The positive case (flag enabled → client accepted end-to-end by the operator
  // AND reconciled into Keycloak via the UDS Client Profile) is validated in the
  // uds-identity-config test suite where the Keycloak-side executor is exercised.
  it("denies a non-device-flow public client by default", async () => {
    await K8s(UDSPackage)
      .Apply({
        metadata: {
          name: "deny-public-standard-flow-default",
          namespace: TEST_NS,
        },
        spec: {
          sso: [
            {
              name: "Public Standard Flow Client",
              clientId: "deny-public-standard-flow-default-client",
              publicClient: true,
              standardFlowEnabled: true,
              redirectUris: ["https://public-clients-test.uds.dev/callback"],
              attributes: { "pkce.code.challenge.method": "S256" },
            },
          ],
        },
      })
      .then(failIfReached)
      .catch((e: Error) =>
        expect(e).toMatchObject({
          ok: false,
          data: {
            message: expect.stringContaining("ALLOW_PUBLIC_CLIENTS"),
          },
        }),
      );
  });
});
