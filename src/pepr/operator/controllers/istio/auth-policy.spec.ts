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

    it("should generate per-port rules with to.operation.ports when identitiesByPort is provided", () => {
      const host = "example.com";
      const generation = 1;

      const identitiesByPort = {
        "80": {
          saPrincipals: ["cluster.local/ns/ns1/sa/http"],
          namespaces: ["ns-http"],
        },
        "443": {
          saPrincipals: ["cluster.local/ns/ns1/sa/https"],
          namespaces: ["ns-https"],
        },
      };

      const ap = generateCentralAmbientEgressAuthorizationPolicy(
        host,
        generation,
        { saPrincipals: [], namespaces: [] },
        undefined,
        identitiesByPort,
      );

      const rules = ap.spec?.rules ?? [];
      expect(rules).toHaveLength(2);

      expect(rules[0].to?.[0]?.operation?.ports).toEqual(["80"]);
      const r0Sources = (rules[0].from ?? []).map(f => f.source);
      expect(r0Sources.some(s => s?.principals?.includes("cluster.local/ns/ns1/sa/http"))).toBe(
        true,
      );
      expect(r0Sources.some(s => s?.namespaces?.includes("ns-http"))).toBe(true);

      expect(rules[1].to?.[0]?.operation?.ports).toEqual(["443"]);
      const r1Sources = (rules[1].from ?? []).map(f => f.source);
      expect(r1Sources.some(s => s?.principals?.includes("cluster.local/ns/ns1/sa/https"))).toBe(
        true,
      );
      expect(r1Sources.some(s => s?.namespaces?.includes("ns-https"))).toBe(true);
    });
  });
});

// Legacy per-namespace ambient authorization policy name tests removed.
