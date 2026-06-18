/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s, kind } from "pepr";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { createTempPod, deleteTempPod, execInPod } from "./helpers/k8s";

// Image pull plus the openssl handshakes need headroom on slow CI API servers.
vi.setConfig({ testTimeout: 60000, hookTimeout: 120000 });

// Forcing pqc makes the tenant gateway reject non-PQC clients, which would break the standard
// e2e suite's external egress and browser checks. This spec therefore only runs when the
// dedicated PQC scenario opts in, mirroring the EGRESS_TESTS gate in network.spec.ts.
const runPqcTests = process.env.PQC_TESTS === "true";

// Pinned image shipping the OpenSSL >= 3.5 CLI, which knows the X25519MLKEM768 hybrid group.
// Older OpenSSL and the FIPS BoringSSL builds do not recognize the group name.
// renovate: datasource=docker depName=alpine/openssl
const OPENSSL_IMAGE =
  "alpine/openssl@sha256:923270611179f81b420bfb5bb5c18bf07fd59d84ed4163ac04cb371faa6d150f";

// kube-system is exempt from UDS policies and the Zarf mutating webhook, and a pod there can
// reach the tenant gateway. This mirrors the temp-pod approach in falco.spec.ts.
const PROBE_NS = "kube-system";
const PROBE_CONTAINER = "main"; // createTempPod names the container "main"

// An application host served by the tenant gateway. Override for clusters using a different host.
const GATEWAY_HOST = process.env.PQC_GATEWAY_HOST ?? "demo-8080.uds.dev";
const GATEWAY_PORT = process.env.PQC_GATEWAY_PORT ?? "443";

(runPqcTests ? describe : describe.skip)("Istio COMPLIANCE_POLICY=pqc force mode", () => {
  let probePod = "";

  beforeAll(async () => {
    probePod = await createTempPod({
      name: `openssl-pqc-probe-${Date.now()}`,
      namespace: PROBE_NS,
      image: OPENSSL_IMAGE,
      command: ["sleep", "3600"],
    });
  });

  afterAll(async () => {
    if (probePod) {
      await deleteTempPod(probePod, PROBE_NS);
    }
  });

  // Offer exactly one key-exchange group over TLS 1.3 and capture the result. `2>&1` keeps
  // handshake alerts in stdout; the trailing marker exposes openssl's own exit code, since the
  // exec exit code reflects the wrapping `sh` (which the trailing echo always makes 0).
  async function handshakeWithGroup(group: string) {
    return execInPod(PROBE_NS, probePod, PROBE_CONTAINER, [
      "sh",
      "-c",
      `echo | openssl s_client -connect ${GATEWAY_HOST}:${GATEWAY_PORT} ` +
        `-servername ${GATEWAY_HOST} -groups ${group} -tls1_3 2>&1; echo "OPENSSL_EXIT:$?"`,
    ]);
  }

  // C. Plumbing. The ztunnel L4 mTLS hop is not observable on the wire, so assert the policy is
  // present on both workloads; combined with the aws-lc ztunnel build this is the L4 evidence.
  test("sets COMPLIANCE_POLICY=pqc on the istiod Deployment and ztunnel DaemonSet", async () => {
    const istiod = await K8s(kind.Deployment).InNamespace("istio-system").Get("istiod");
    const istiodPolicy = (istiod.spec?.template?.spec?.containers ?? [])
      .flatMap(c => c.env ?? [])
      .find(e => e.name === "COMPLIANCE_POLICY");
    expect(istiodPolicy?.value, "COMPLIANCE_POLICY on the istiod Deployment").toBe("pqc");

    const ztunnel = await K8s(kind.DaemonSet).InNamespace("istio-system").Get("ztunnel");
    const ztunnelPolicy = (ztunnel.spec?.template?.spec?.containers ?? [])
      .flatMap(c => c.env ?? [])
      .find(e => e.name === "COMPLIANCE_POLICY");
    expect(ztunnelPolicy?.value, "COMPLIANCE_POLICY on the ztunnel DaemonSet").toBe("pqc");
  });

  // OpenSSL >= 3.5 prints "Negotiated TLS1.3 group: <name>" (older OpenSSL: "Server Temp Key: <name>").
  // On a rejected handshake the value is "<NULL>", so a *real* negotiated group is the prefix followed
  // by a name other than "<NULL>".
  const GROUP_PREFIX = String.raw`(?:Negotiated TLS1\.3 group|Server Temp Key):\s*`;
  const REAL_GROUP = new RegExp(GROUP_PREFIX + String.raw`(?!<NULL>)\S`, "i");

  // A. Positive. A PQC-capable client must negotiate the hybrid group at the gateway downstream.
  test("tenant gateway negotiates X25519MLKEM768 with a PQC-capable client", async () => {
    const res = await handshakeWithGroup("X25519MLKEM768");
    const detail = `host=${GATEWAY_HOST}:${GATEWAY_PORT}\n${res.stdout}`;
    expect(res.stdout, detail).toMatch(new RegExp(GROUP_PREFIX + "X25519MLKEM768", "i"));
  });

  // B. Negative. This is what distinguishes FORCE from PREFER: a classical-only TLS 1.3 client
  // MUST be rejected. If it connects instead, the test fails honestly rather than passing.
  test("tenant gateway rejects a classical-only (X25519) client", async () => {
    const res = await handshakeWithGroup("X25519");
    const detail = `Classical-only client must be REJECTED (force, not prefer). host=${GATEWAY_HOST}:${GATEWAY_PORT}\n${res.stdout}`;
    const exitMatch = res.stdout.match(/OPENSSL_EXIT:(\d+)/);
    const opensslExit = exitMatch ? Number(exitMatch[1]) : NaN;

    // No real key-exchange group was negotiated (OpenSSL prints "<NULL>" on a rejected handshake)...
    expect(res.stdout, detail).not.toMatch(REAL_GROUP);
    // ...and the handshake failed (non-zero openssl exit, or an explicit TLS alert).
    const handshakeFailed =
      opensslExit !== 0 ||
      /handshake failure|no shared|illegal[_ ]parameter|alert/i.test(res.stdout);
    expect(handshakeFailed, detail).toBe(true);
  });
});
