/** Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */
import { afterAll, expect, vi, type Mock } from "vitest";
import { writeFileSync } from "node:fs";
const capture = vi.hoisted(() => ({ cases: [] as unknown[] }));
type CapturedValidation = {
  name: string | undefined;
  kind: string;
  object: unknown;
  allowAll?: boolean;
  allowed?: boolean;
  message?: string;
};
vi.mock("../../../pepr/operator/crd/validators/exempt-validator", async importOriginal => {
  const original =
    await importOriginal<
      typeof import("../../../pepr/operator/crd/validators/exempt-validator.js")
    >();
  const { UDSConfig } = await import("../../../pepr/operator/controllers/config/config.js");
  return {
    ...original,
    exemptValidator: async (req: Parameters<typeof original.exemptValidator>[0]) => {
      const entry: CapturedValidation = {
        name: expect.getState().currentTestName,
        kind: "Exemption",
        object: structuredClone(req.Raw),
        allowAll: UDSConfig.allowAllNSExemptions,
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
        entry.message = message;
        entry.allowed = false;
        return deny?.(message);
      });
      approveMock.mockImplementation(() => {
        entry.message = "";
        entry.allowed = true;
        return approve?.();
      });
      try {
        return await original.exemptValidator(req);
      } finally {
        capture.cases.push(entry);
      }
    },
  };
});
vi.mock("../../../pepr/operator/crd/validators/clusterconfig-validator", async importOriginal => {
  const original =
    await importOriginal<
      typeof import("../../../pepr/operator/crd/validators/clusterconfig-validator.js")
    >();
  return {
    ...original,
    validateCfg: (object: Parameters<typeof original.validateCfg>[0]) => {
      const entry: CapturedValidation = {
        name: expect.getState().currentTestName,
        kind: "ClusterConfig",
        object: structuredClone(object),
        allowed: true,
        message: "",
      };
      try {
        return original.validateCfg(object);
      } catch (error) {
        entry.allowed = false;
        entry.message = `Validation failed: ${(error as Error).message}`;
        throw error;
      } finally {
        capture.cases.push(entry);
      }
    },
    validateCfgUpdate: async (req: Parameters<typeof original.validateCfgUpdate>[0]) => {
      const entry: CapturedValidation = {
        name: expect.getState().currentTestName,
        kind: "ClusterConfig",
        object: structuredClone(req.Raw),
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
        entry.message = message;
        entry.allowed = false;
        return deny?.(message);
      });
      approveMock.mockImplementation(() => {
        entry.message = "";
        entry.allowed = true;
        return approve?.();
      });
      try {
        return await original.validateCfgUpdate(req);
      } finally {
        capture.cases.push(entry);
      }
    },
  };
});
import "../../../pepr/operator/crd/validators/exempt-validator.spec";
import "../../../pepr/operator/crd/validators/clusterconfig-validator.spec";
afterAll(() =>
  writeFileSync(
    "src/go-controller/internal/admission/resources/testdata/custom-resource-parity.json",
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
