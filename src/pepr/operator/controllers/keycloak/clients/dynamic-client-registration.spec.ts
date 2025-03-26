/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { addRequiredAttributesToClient } from "./dynamic-client-registration";

describe("addRequiredAttributesToClient", () => {
  it("should add 'created-by' attribute if attributes are present", async () => {
    const client = { attributes: { existing: "value" } };
    const result = addRequiredAttributesToClient(client);
    expect(result.attributes).toEqual({ existing: "value", "created-by": "uds-operator" });
  });

  it("should add 'created-by' attribute if attributes are not present", async () => {
    const client = {
      attributes: undefined,
    };
    const result = addRequiredAttributesToClient(client);
    expect(result.attributes).toEqual({ "created-by": "uds-operator" });
  });
});
