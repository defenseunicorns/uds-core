/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { afterAll, beforeAll, describe, expect, it, jest } from "@jest/globals";
import {
  calculateFutureDate,
  encodeConfig,
  isConfigUpdateRequired,
  parseLokiConfig,
  updateConfigDate,
} from "./utils";

import { UDSConfig } from "../config";

describe("calculateFutureDate", () => {
  beforeAll(() => {
    // Mocking global date to ensure consistent results in testing future date calculations.
    jest.spyOn(Date, "now").mockImplementation(() => new Date("2023-01-01T00:00:00Z").getTime());
    const originalDate = Date;
    jest.spyOn(global, "Date").mockImplementation((...args) => {
      return args.length ? new originalDate(...args) : new originalDate("2023-01-01T00:00:00Z");
    });
  });

  afterAll(() => {
    // Restoring all mocks to their original implementations after tests are done.
    jest.restoreAllMocks();
  });

  it("should return a date string two days in the future", () => {
    // Ensuring the calculateFutureDate correctly adds days to the current date.
    const result = calculateFutureDate(2);
    expect(result).toBe("2023-01-03");
  });
});

describe("parseLokiConfig", () => {
  it("should parse valid YAML string into an object", () => {
    // Testing the function's ability to correctly parse a well-formed YAML into a config object.
    const yamlString = `
      schema_config:
        configs:
          - from: "2023-01-01"
            store: "${UDSConfig.lokiDefaultStore}"
            index:
              prefix: "loki_"
              period: "24h"
    `;
    const result = parseLokiConfig(yamlString);
    expect(result).toEqual({
      schema_config: {
        configs: [
          {
            from: "2023-01-01",
            store: UDSConfig.lokiDefaultStore,
            index: {
              prefix: "loki_",
              period: "24h",
            },
          },
        ],
      },
    });
  });

  it("should return null on invalid YAML", () => {
    // Testing the function's error handling on receiving bad YAML format.
    const badYaml = `: I am not YAML!`;
    expect(parseLokiConfig(badYaml)).toBeNull();
  });
});

describe("updateConfigDate", () => {
  it(`should update the from date in the ${UDSConfig.lokiDefaultStore} config`, () => {
    // Verifying that the function updates the 'from' date for a specified store type.
    const configs = [
      {
        from: "2023-01-01",
        store: UDSConfig.lokiDefaultStore,
      },
    ];
    const result = updateConfigDate(configs, UDSConfig.lokiDefaultStore, "2023-01-10");
    expect(result).toBeTruthy();
    expect(configs[0].from).toBe("2023-01-10");
  });

  it(`should return false if no ${UDSConfig.lokiDefaultStore} config is found`, () => {
    // Testing the function's response when no matching store type configuration is found.
    const configs = [{ from: "2023-01-01", store: "other" }];
    expect(updateConfigDate(configs, "2023-01-10", UDSConfig.lokiDefaultStore)).toBeFalsy();
  });
});

describe("encodeConfig", () => {
  it("should encode a config object to a YAML string", () => {
    // Ensuring that the encodeConfig function can serialize a config object back to YAML format correctly.
    const config = {
      schema_config: {
        configs: [
          {
            from: "2023-01-01",
            store: UDSConfig.lokiDefaultStore,
            index: {
              prefix: "loki_",
              period: "24h",
            },
          },
        ],
      },
    };
    const yamlString = encodeConfig(config);
    expect(yamlString).toMatch(new RegExp(UDSConfig.lokiDefaultStore));
    expect(yamlString).toMatch(/loki_/);
  });
});

describe("isConfigUpdateRequired", () => {
  it(`should return false if ${UDSConfig.lokiDefaultStore} is set correctly in the future and is the latest configuration`, () => {
    // Validating that no update is required if the default store type is already correctly set.
    const configs = [
      { from: "2023-01-01", store: "boltdb-shipper" },
      { from: "2025-01-01", store: UDSConfig.lokiDefaultStore },
    ];
    const lokiConfig = { schema_config: { configs } };
    expect(isConfigUpdateRequired(lokiConfig, UDSConfig.lokiDefaultStore)).toBe(false);
  });

  it(`should return true if ${UDSConfig.lokiDefaultStore} is set in the past`, () => {
    // Checking that an update is required if the default store type's date is set in the past.
    const configs = [
      { from: "2021-01-01", store: "boltdb-shipper" },
      { from: "2020-01-01", store: UDSConfig.lokiDefaultStore },
    ];
    const lokiConfig = { schema_config: { configs } };
    expect(isConfigUpdateRequired(lokiConfig, UDSConfig.lokiDefaultStore)).toBe(true);
  });

  it(`should return true if ${UDSConfig.lokiDefaultStore} is not the latest configuration`, () => {
    // Ensuring that an update is needed if there is a newer configuration than the default store type.
    const configs = [
      { from: "2025-01-02", store: "boltdb-shipper" },
      { from: "2025-01-01", store: UDSConfig.lokiDefaultStore },
    ];
    const lokiConfig = { schema_config: { configs } };
    expect(isConfigUpdateRequired(lokiConfig, UDSConfig.lokiDefaultStore)).toBe(true);
  });

  it(`should return true if ${UDSConfig.lokiDefaultStore} configuration is missing`, () => {
    // Testing that an update is required if the default store type configuration is completely missing.
    const configs = [{ from: "2023-01-01", store: "boltdb-shipper" }];
    const lokiConfig = { schema_config: { configs } };
    expect(isConfigUpdateRequired(lokiConfig, UDSConfig.lokiDefaultStore)).toBe(true);
  });

  it(`should return true when config is empty`, () => {
    // Testing that an update is required if the config is completely missing.
    expect(isConfigUpdateRequired({}, UDSConfig.lokiDefaultStore)).toBe(true);
  });
});
