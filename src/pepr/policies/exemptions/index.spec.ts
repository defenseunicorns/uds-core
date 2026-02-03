/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { PeprValidateRequest, kind } from "pepr";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { ExemptionStore } from "../../operator/controllers/exemptions/exemption-store.js";
import { MatcherKind, Policy } from "../../operator/crd/index.js";
import { isExempt } from "./index.js";

describe("test registering exemptions", () => {
  beforeAll(() => {
    ExemptionStore.init();
    vi.spyOn(ExemptionStore, "getByPolicy").mockReturnValue([
      {
        namespace: "falco",
        name: "^falco-.*",
        kind: MatcherKind.Pod,
        owner: "uid",
      },
    ]);
  });

  it("should be exempt", () => {
    const req = {
      Raw: {
        metadata: {
          name: "falco-pod-x",
          namespace: "falco",
        },
      },
    } as unknown as PeprValidateRequest<kind.Pod>;
    const exempt = isExempt(req, Policy.DisallowPrivileged);
    expect(exempt).toBe(true);
  });

  it("should not be exempt", () => {
    const req = {
      Raw: {
        metadata: {
          name: "vector",
          namespace: "monitoring",
        },
      },
    } as unknown as PeprValidateRequest<kind.Pod>;
    const exempt = isExempt(req, Policy.DisallowPrivileged);
    expect(exempt).toBe(false);
  });
});
