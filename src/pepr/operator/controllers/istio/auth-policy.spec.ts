/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { describe, expect, it } from "vitest";
import { RemoteProtocol } from "../../crd";
import { generateAmbientEgressAuthorizationPolicy } from "./auth-policy";
import { generateLocalEgressSEName } from "./service-entry";

describe("test generate authorization policy", () => {
  it("should generate auth policy with service account", () => {
    const pkgName = "test-pkg";
    const host = "example.com";
    const serviceEntryName = generateLocalEgressSEName(
      pkgName,
      [{ port: 443, protocol: RemoteProtocol.TLS }],
      host,
    );
    const serviceAccount = "test-service-account";

    const authPolicy = generateAmbientEgressAuthorizationPolicy(
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
                principals: [`cluster.local/ns/test-ns/sa/${serviceAccount}`],
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

  it("should generate auth policy without service account", () => {
    const pkgName = "test-pkg";
    const host = "example.com";
    const serviceEntryName = generateLocalEgressSEName(
      pkgName,
      [{ port: 443, protocol: RemoteProtocol.TLS }],
      host,
    );

    const authPolicy = generateAmbientEgressAuthorizationPolicy(
      host,
      pkgName,
      "test-ns",
      "1",
      [],
      serviceEntryName,
      undefined,
    );

    expect(authPolicy.metadata?.name).toBe("example-com-egress");
    expect(authPolicy.spec?.action).toBe("ALLOW");
    expect(authPolicy.spec?.rules).toEqual(
      expect.arrayContaining([
        {
          from: [
            {
              source: {
                namespaces: ["test-ns"],
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
