/**
 * Copyright 2024-2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { describe, expect, it } from "vitest";
import { allowEgressDNS } from "./allow-egress-dns";

describe("allowEgressDNS", () => {
  it("should target kube-dns in kube-system", () => {
    const policy = allowEgressDNS("test-ns");

    expect(policy.metadata?.namespace).toEqual("test-ns");
    expect(policy.spec?.egress?.[0].to).toEqual([
      {
        namespaceSelector: {
          matchLabels: { "kubernetes.io/metadata.name": "kube-system" },
        },
        podSelector: {
          matchLabels: { "k8s-app": "kube-dns" },
        },
      },
    ]);
  });

  it("should allow UDP port 53 for primary DNS queries", () => {
    const policy = allowEgressDNS("test-ns");
    expect(policy.spec?.egress?.[0].ports).toEqual([{ port: 53, protocol: "UDP" }]);
  });

  it("should use UDP protocol so that policies.ts does not inject port 15008", () => {
    // policies.ts skips 15008 injection when ALL ports in the list are UDP.
    // This test guards the contract: if allowEgressDNS ever loses the UDP stamp,
    // port 15008 will be injected into the DNS policy, breaking UDP-only enforcement.
    const policy = allowEgressDNS("test-ns");
    const ports = policy.spec?.egress?.[0].ports ?? [];
    expect(ports.every(p => p.protocol === "UDP")).toBe(true);
    expect(ports.map(p => p.port)).not.toContain(15008);
  });
});
