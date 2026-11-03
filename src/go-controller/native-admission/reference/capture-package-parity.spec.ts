/** Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */
import { afterAll, expect, vi, type Mock } from "vitest";
import { writeFileSync } from "node:fs";

// Execute the pinned Core validator's actual specification, preserving every
// input, config and cache state for the Go differential test. No Core source is
// executed by the replacement controller.
const capture = vi.hoisted(() => ({
  packages: new Map<string, unknown>(),
  cases: [] as unknown[],
}));
vi.mock("../../../pepr/operator/controllers/packages/package-store", async importOriginal => {
  const original =
    await importOriginal<
      typeof import("../../../pepr/operator/controllers/packages/package-store.js")
    >();
  const store = original.PackageStore;
  return {
    ...original,
    PackageStore: {
      ...store,
      init() {
        capture.packages.clear();
        return store.init();
      },
      add(...args: Parameters<typeof store.add>) {
        const [pkg] = args;
        capture.packages.set(
          `${pkg.metadata?.namespace}/${pkg.metadata?.name}`,
          structuredClone(pkg),
        );
        return store.add(...args);
      },
      remove(...args: Parameters<typeof store.remove>) {
        const [pkg] = args;
        capture.packages.delete(`${pkg.metadata?.namespace}/${pkg.metadata?.name}`);
        return store.remove(...args);
      },
    },
  };
});
vi.mock("../../../pepr/operator/crd/validators/package-validator", async importOriginal => {
  const original =
    await importOriginal<
      typeof import("../../../pepr/operator/crd/validators/package-validator.js")
    >();
  const { UDSConfig } = await import("../../../pepr/operator/controllers/config/config.js");
  return {
    ...original,
    validator: async (req: Parameters<typeof original.validator>[0]) => {
      const entry: {
        name: string | undefined;
        object: unknown;
        old: unknown;
        existing: unknown[];
        config: typeof UDSConfig;
        allowed?: boolean;
        message?: string;
      } = {
        name: expect.getState().currentTestName,
        object: structuredClone(req.Raw),
        old: structuredClone(req.OldResource),
        existing: [...capture.packages.values()].map(value => structuredClone(value)),
        config: structuredClone(UDSConfig),
      };
      const denyMock = req.Deny as unknown as Mock<
          (...args: Parameters<typeof req.Deny>) => unknown
        >,
        approveMock = req.Approve as unknown as Mock<
          (...args: Parameters<typeof req.Approve>) => unknown
        >;
      const deny = denyMock.getMockImplementation(),
        approve = approveMock.getMockImplementation();
      denyMock.mockImplementation((message?: string) => {
        entry.allowed = false;
        entry.message = message;
        return deny?.(message);
      });
      approveMock.mockImplementation(() => {
        entry.allowed = true;
        entry.message = "";
        return approve?.();
      });
      try {
        return await original.validator(req);
      } finally {
        capture.cases.push(entry);
        denyMock.mockImplementation(deny ?? (() => undefined));
        approveMock.mockImplementation(approve ?? (() => undefined));
      }
    },
  };
});
import "../../../pepr/operator/crd/validators/package-validator.spec";

afterAll(() => {
  writeFileSync(
    "src/go-controller/internal/admission/resources/testdata/package-parity.json",
    JSON.stringify(
      {
        sourceRevision: "129d6e4a1928ce2b10ba6c5c8b5a0e7350f4053c",
        cases: capture.cases,
      },
      null,
      2,
    ) + "\n",
  );
});
