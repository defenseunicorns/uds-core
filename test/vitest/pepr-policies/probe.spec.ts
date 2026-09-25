/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s } from "pepr";
import { describe, expect, it } from "vitest";
import { PrometheusProbe } from "../../../src/pepr/operator/crd";

const POLICY_TEST_NAMESPACE = "policy-tests";
const HEALTHY_PROBE_TARGET =
  "http://prometheus-operated.monitoring.svc.cluster.local:9090/-/healthy";

const failIfReached = () => expect(true).toBe(false);

const makeProbe = (name: string, namespace: string, module: string) => ({
  metadata: { name, namespace },
  spec: {
    module,
    prober: { url: "prometheus-blackbox-exporter.monitoring.svc.cluster.local:9115" },
    // These probes test admission policy only. Use a healthy target so the
    // fixture cannot fire the global UDSProbeEndpointDown alert.
    targets: { staticConfig: { static: [HEALTHY_PROBE_TARGET] } },
  },
});

function isNotFound(error: unknown): boolean {
  const maybeError = error as {
    code?: number;
    status?: number;
    statusCode?: number;
    response?: { status?: number; statusCode?: number };
  };

  return (
    maybeError.code === 404 ||
    maybeError.status === 404 ||
    maybeError.statusCode === 404 ||
    maybeError.response?.status === 404 ||
    maybeError.response?.statusCode === 404
  );
}

async function deleteProbe(name: string): Promise<void> {
  try {
    await K8s(PrometheusProbe).InNamespace(POLICY_TEST_NAMESPACE).Delete(name);
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
}

async function applyAllowedProbe(name: string, module: string): Promise<void> {
  try {
    const probe = await K8s(PrometheusProbe, {
      name,
      namespace: POLICY_TEST_NAMESPACE,
    }).Apply(makeProbe(name, POLICY_TEST_NAMESPACE, module));
    expect(probe).toBeDefined();
  } finally {
    await deleteProbe(name);
  }
}

describe("probe validator", () => {
  it("should deny a probe that references an SSO module owned by a different namespace", async () => {
    await K8s(PrometheusProbe)
      .Apply(
        makeProbe(
          "probe-cross-ns",
          POLICY_TEST_NAMESPACE,
          "http_200x_sso_other-namespace_victim-client-probe",
        ),
      )
      .then(failIfReached)
      .catch((e: Error) =>
        expect(e).toMatchObject({
          ok: false,
          data: {
            message: expect.stringContaining(
              "Probe is not authorized to use this Blackbox Exporter module",
            ),
          },
        }),
      );
  });

  it("should deny a probe with a bare http_200x_sso module (no namespace segment)", async () => {
    await K8s(PrometheusProbe)
      .Apply(makeProbe("probe-bare-sso", POLICY_TEST_NAMESPACE, "http_200x_sso"))
      .then(failIfReached)
      .catch((e: Error) =>
        expect(e).toMatchObject({
          ok: false,
          data: {
            message: expect.stringContaining(
              "Probe is not authorized to use this Blackbox Exporter module",
            ),
          },
        }),
      );
  });

  it("should allow a probe with a module scoped to its own namespace", async () => {
    await applyAllowedProbe("probe-correct-ns", "http_200x_sso_policy-tests_uds-app-probe");
  });

  it("should allow a probe using the standard http_2xx module", async () => {
    await applyAllowedProbe("probe-standard", "http_2xx");
  });
});
