/** Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */
import { afterAll, expect, vi } from "vitest";
import { writeFileSync } from "node:fs";
const capture = vi.hoisted(() => ({ cases: [] as unknown[] }));

async function wrap<T extends object>(
  importOriginal: () => Promise<T>,
  names: (keyof Awaited<T>)[],
) {
  const original = await importOriginal();
  const result = { ...original };
  for (const name of names) {
    const callable = original[name];
    if (typeof callable !== "function")
      throw new TypeError(`Captured export ${String(name)} is not a function`);
    result[name] = ((...args: unknown[]) => {
      // Functions on the test request are reduced to their observable status bit.
      const serialize = (args: unknown[]) =>
        JSON.parse(
          JSON.stringify(
            args.map(value => {
              if (typeof value === "object" && value !== null && "Raw" in value && value.Raw) {
                const request = value as { Raw: unknown; HasAnnotation?: (key: string) => unknown };
                return {
                  Raw: request.Raw,
                  annotation: request.HasAnnotation?.("sidecar.istio.io/status"),
                };
              }
              return value;
            }),
          ),
        );
      const before = serialize(args);
      const returned: unknown = Reflect.apply(callable, original, args);
      capture.cases.push({
        name: expect.getState().currentTestName,
        function: name,
        args: before,
        result: returned === undefined ? null : returned,
        after: serialize(args),
      });
      return returned;
    }) as Awaited<T>[typeof name];
  }
  return result;
}
vi.mock("../../../pepr/policies/common", async importOriginal =>
  wrap(
    () => importOriginal<typeof import("../../../pepr/policies/common.js")>(),
    ["parseImageRef", "validateIstioImage", "isIstioInitContainer", "isIstioProxyContainer"],
  ),
);
vi.mock("../../../pepr/policies/security", async importOriginal =>
  wrap(
    () => importOriginal<typeof import("../../../pepr/policies/security.js")>(),
    [
      "setPrivilegeEscalation",
      "validatePrivilegeEscalation",
      "setNonRootUserSettings",
      "isRootSecurityContext",
      "validateProcMount",
      "validateSeccompProfile",
      "validateSELinuxOptions",
      "validateSELinuxTypes",
      "setAllContainersDropAllCapabilities",
      "findContainersWithoutDropAllCapability",
      "validateContainerCapabilities",
    ],
  ),
);
vi.mock("../../../pepr/policies/istio", async importOriginal =>
  wrap(
    () => importOriginal<typeof import("../../../pepr/policies/istio.js")>(),
    [
      "isPodUsingIstioUserID",
      "findContainerUsingIstioUserID",
      "checkIstioAmbientOverrides",
      "checkIstioSidecarOverrides",
      "checkIstioTrafficInterceptionOverrides",
    ],
  ),
);
vi.mock("../../../pepr/policies/storage", async importOriginal =>
  wrap(
    () => importOriginal<typeof import("../../../pepr/policies/storage.js")>(),
    ["validateVolumeTypes", "validateHostPathVolumes"],
  ),
);
vi.mock("../../../pepr/policies/networking", async importOriginal =>
  wrap(
    () => importOriginal<typeof import("../../../pepr/policies/networking.js")>(),
    [
      "checkNoHostNamespaces",
      "checkNoHostPorts",
      "checkNotExternalNameService",
      "checkNotNodePortService",
    ],
  ),
);
import "../../../pepr/policies/common.spec";
import "../../../pepr/policies/security.spec";
import "../../../pepr/policies/istio.spec";
import "../../../pepr/policies/storage.spec";
import "../../../pepr/policies/networking.spec";
afterAll(() =>
  writeFileSync(
    "src/go-controller/internal/admission/policies/testdata/core-policy-parity.json",
    JSON.stringify(
      {
        sourceRevision: "c15677633cffa17e99656a7d7ccd1f98d7cb6e4d",
        cases: capture.cases,
      },
      null,
      2,
    ) + "\n",
  ),
);
