/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { describe, expect, it } from "vitest";
import { generateCentralAmbientEgressAuthorizationPolicy } from "./auth-policy";

describe("test generate authorization policy", () => {
  describe("test generate central ambient authorization policy", () => {
    it("should generate central AP targeting ServiceEntry with from-only rules", () => {
      const host = "example.com";
      const generation = 1;
      const saPrincipals = ["cluster.local/ns/ns1/sa/sa1", "cluster.local/ns/ns2/sa/sa2"];
      const namespaces = ["ns3"]; // participant namespace

      const ap = generateCentralAmbientEgressAuthorizationPolicy(host, generation, {
        saPrincipals,
        namespaces,
      });

      expect(ap.metadata?.namespace).toBe("istio-egress-ambient");
      expect(ap.metadata?.name).toBe("ambient-ap-example-com");
      expect(ap.spec?.action).toBe("ALLOW");
      expect(ap.spec?.targetRef).toEqual({
        group: "networking.istio.io",
        kind: "ServiceEntry",
        name: "ambient-se-example-com",
      });

      // from-only rules: contains principals and namespaces, no 'to'
      const rules = ap.spec?.rules || [];
      expect(rules.length).toBeGreaterThan(0);
      for (const r of rules) {
        expect(r).toHaveProperty("from");
        expect(r).not.toHaveProperty("to");
      }
      // ensure sources captured
      const flattenedSources = rules.flatMap(r => r.from || []);
      const principalsEntry = flattenedSources.find(s => s.source?.principals);
      const namespacesEntry = flattenedSources.find(s => s.source?.namespaces);
      expect(principalsEntry?.source?.principals).toEqual(expect.arrayContaining(saPrincipals));
      expect(namespacesEntry?.source?.namespaces).toEqual(expect.arrayContaining(namespaces));
    });
  });
});

// Legacy per-namespace ambient authorization policy name tests removed.
