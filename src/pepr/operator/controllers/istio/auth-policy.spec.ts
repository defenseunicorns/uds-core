/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { describe, expect, it } from "vitest";
import { RemoteProtocol } from "../../crd";
import { generateAuthorizationPolicy } from "./auth-policy";
import { generateLocalEgressSEName } from "./service-entry";

describe("test generate authorization policy", () => {
  it("should generate auth policy", () => {
    const pkgName = "test-pkg";
    const host = "example.com";
    const serviceEntryName = generateLocalEgressSEName(
      pkgName,
      [{ port: 443, protocol: RemoteProtocol.TLS }],
      host,
    );
    const serviceAccount = "test-service-account";

    const authPolicy = generateAuthorizationPolicy(
      host,
      pkgName,
      "test-ns",
      "1",
      [],
      serviceEntryName,
      serviceAccount,
    );

    expect(authPolicy.metadata?.name).toBe("example-com-test-service-account-egress");
    expect(authPolicy.spec?.action).toBe("ALLOW");
    expect(authPolicy.spec?.rules).toEqual(
      expect.arrayContaining([
        {
          from: [
            {
              source: {
                serviceAccounts: [serviceAccount],
              },
            },
          ],
        },
      ]),
    );
    expect(authPolicy.spec?.targetRef).toEqual({
      group: "networking.istio.io",
      kind: "ServiceEntry",
      name: serviceEntryName,
    });
  });
});
