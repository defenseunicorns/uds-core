/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s } from "pepr";
import { describe, expect, it } from "vitest";
import { PrometheusProbe } from "../../../src/pepr/operator/crd";

const failIfReached = () => expect(true).toBe(false);

const makeProbe = (name: string, namespace: string, module: string) => ({
  metadata: { name, namespace },
  spec: {
    module,
    prober: { url: "prometheus-blackbox-exporter.monitoring.svc.cluster.local:9115" },
    targets: { staticConfig: { static: ["https://app.uds.dev/"] } },
  },
});

describe("probe validator", () => {
  it("should deny a probe that references an SSO module owned by a different namespace", async () => {
    await K8s(PrometheusProbe)
      .Apply(
        makeProbe(
          "probe-cross-ns",
          "policy-tests",
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
      .Apply(makeProbe("probe-bare-sso", "policy-tests", "http_200x_sso"))
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
    const probe = await K8s(PrometheusProbe).Apply(
      makeProbe("probe-correct-ns", "policy-tests", "http_200x_sso_policy-tests_uds-app-probe"),
    );
    expect(probe).toBeDefined();
  });

  it("should allow a probe using the standard http_2xx module", async () => {
    const probe = await K8s(PrometheusProbe).Apply(
      makeProbe("probe-standard", "policy-tests", "http_2xx"),
    );
    expect(probe).toBeDefined();
  });
});
