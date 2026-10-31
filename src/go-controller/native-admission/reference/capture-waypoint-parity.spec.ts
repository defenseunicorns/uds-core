/** Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */
import { afterAll, expect, it, vi } from "vitest";
import { writeFileSync } from "node:fs";
vi.mock("../../../pepr/operator/controllers/packages/package-store.js", () => ({
  PackageStore: {
    getPackageByNamespace: (namespace: string) =>
      namespace === "apps"
        ? {
            metadata: { name: "app", namespace: "apps", uid: "owner" },
            spec: {
              network: { serviceMesh: { mode: "ambient" } },
              sso: [{ clientId: "demo", name: "demo", enableAuthserviceSelector: { app: "demo" } }],
            },
          }
        : undefined,
  },
}));
import {
  reconcilePod,
  reconcileService,
} from "../../../pepr/operator/controllers/istio/ambient-waypoint.js";

const cases: unknown[] = [];
for (const kind of ["Pod", "Service"])
  for (const [component, gateway] of [
    ["", ""],
    ["ambient-waypoint", ""],
    ["ambient-waypoint", "ordinary"],
    ["", "demo-waypoint"],
    ["ambient-waypoint", "demo-waypoint"],
  ]) {
    it(`pinned ${kind} waypoint shape ${component}/${gateway}`, async () => {
      const labels: Record<string, string> = { app: "demo", unrelated: "preserve" };
      if (component) labels["app.kubernetes.io/component"] = component;
      if (gateway) labels["gateway.networking.k8s.io/gateway-name"] = gateway;
      const object = {
        metadata: { name: "workload", namespace: "apps", labels },
        spec: { selector: { app: "demo" } },
      };
      const before = JSON.parse(JSON.stringify(object));
      const reconcile = kind === "Pod" ? reconcilePod : reconcileService;
      // The source topology functions consume metadata and Service selectors.
      // The fixture intentionally omits unrelated complete Pod/Service fields.
      const sourceObject = object as unknown as Parameters<typeof reconcilePod>[0] &
        Parameters<typeof reconcileService>[0];
      await reconcile(sourceObject);
      const first = JSON.parse(JSON.stringify(object));
      await reconcile(sourceObject);
      expect(object).toEqual(first);
      delete object.metadata.labels["istio.io/use-waypoint"];
      await reconcile(sourceObject);
      expect(object).toEqual(first);
      cases.push({ kind, object: before, expected: first });
    });
  }
afterAll(() =>
  writeFileSync(
    "src/go-controller/webhook/testdata/core-waypoint-parity.json",
    JSON.stringify(
      {
        sourceRevision: "c15677633cffa17e99656a7d7ccd1f98d7cb6e4d",
        cases,
      },
      null,
      2,
    ) + "\n",
  ),
);
