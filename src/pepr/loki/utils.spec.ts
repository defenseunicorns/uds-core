/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { afterAll, beforeAll, describe, expect, it, jest } from "@jest/globals";
import {
  calculateFutureDate,
  encodeConfig,
  getConfigEntry,
  isConfigUpdateRequired,
  parseLokiConfig,
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

describe("getConfigEntry", () => {
  const configs = [
    { from: "2025-01-01", store: "boltdb-shipper", schema: "v1" },
    {
      from: "2025-01-02",
      store: UDSConfig.lokiDefaultStore,
      schema: UDSConfig.lokiDefaultStoreVersion,
    },
    { from: "2025-01-03", store: "another-store", schema: "another-version" },
  ];

  it("should return the correct config when the specified store and schema version are found", () => {
    const result = getConfigEntry(configs);
    expect(result).toEqual({
      from: "2025-01-02",
      store: UDSConfig.lokiDefaultStore,
      schema: UDSConfig.lokiDefaultStoreVersion,
    });
  });

  it("should return null when no config matches the specified store and schema version", () => {
    const alteredConfigs = configs.map(config => ({
      ...config,
      store: config.store === UDSConfig.lokiDefaultStore ? "non-existent-store" : config.store,
      schema:
        config.schema === UDSConfig.lokiDefaultStoreVersion
          ? "non-existent-version"
          : config.schema,
    }));
    const result = getConfigEntry(alteredConfigs);
    expect(result).toBeNull();
  });

  it("should return null when the configurations array is empty", () => {
    const result = getConfigEntry([]);
    expect(result).toBeNull();
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
  // Ensures that no update is required if the configuration for the default store type and version is set with the latest 'from' date.
  it(`should return false if ${UDSConfig.lokiDefaultStore} with the correct version is set correctly in the future and is the latest configuration`, () => {
    const configs = [
      { from: "2023-01-01", store: "boltdb-shipper", schema: "v1" },
      {
        from: "2025-01-01",
        store: UDSConfig.lokiDefaultStore,
        schema: UDSConfig.lokiDefaultStoreVersion,
      },
    ];
    const lokiConfig = { schema_config: { configs } };
    expect(isConfigUpdateRequired(lokiConfig)).toBe(false);
  });

  // Verifies that an update is required if the 'from' date for the default store type and version is set in the past.
  it(`should return true if ${UDSConfig.lokiDefaultStore} with the correct version is set in the past`, () => {
    const configs = [
      { from: "2021-01-01", store: "boltdb-shipper", schema: "v1" },
      {
        from: "2020-01-01",
        store: UDSConfig.lokiDefaultStore,
        schema: UDSConfig.lokiDefaultStoreVersion,
      },
    ];
    const lokiConfig = { schema_config: { configs } };
    expect(isConfigUpdateRequired(lokiConfig)).toBe(true);
  });

  // Confirms that an update is needed if there is another configuration with a 'from' date newer than that of the default store type and version.
  it(`should return true if ${UDSConfig.lokiDefaultStore} with the correct version is not the latest configuration`, () => {
    const configs = [
      { from: "2025-01-02", store: "boltdb-shipper", schema: "v1" },
      {
        from: "2025-01-01",
        store: UDSConfig.lokiDefaultStore,
        schema: UDSConfig.lokiDefaultStoreVersion,
      },
    ];
    const lokiConfig = { schema_config: { configs } };
    expect(isConfigUpdateRequired(lokiConfig)).toBe(true);
  });

  // Tests that an update is necessary if there is no configuration entry for the default store type and version.
  it(`should return true if configuration for ${UDSConfig.lokiDefaultStore} with the correct version is missing`, () => {
    const configs = [{ from: "2023-01-01", store: "boltdb-shipper", schema: "v1" }];
    const lokiConfig = { schema_config: { configs } };
    expect(isConfigUpdateRequired(lokiConfig)).toBe(true);
  });

  // Checks that an update is required if the configuration data is completely missing.
  it(`should return true when the entire configuration is empty`, () => {
    expect(isConfigUpdateRequired({})).toBe(true);
  });

  // Verifies that an update is required if the default store type is correct but the version is outdated.
  it(`should return true if ${UDSConfig.lokiDefaultStore} matches but the version is outdated`, () => {
    const configs = [
      { from: "2023-01-01", store: "boltdb-shipper", schema: "v1" },
      { from: "2025-01-01", store: UDSConfig.lokiDefaultStore, schema: "old-version" },
    ];
    const lokiConfig = { schema_config: { configs } };
    expect(isConfigUpdateRequired(lokiConfig)).toBe(true);
  });

  // Confirms the need for an update if there exists a configuration with a 'from' date newer than that of the correct store type and version.
  it(`should return true if the correct ${UDSConfig.lokiDefaultStore} and version are set but there is a newer 'from' date in another configuration`, () => {
    const configs = [
      { from: "2025-01-02", store: "boltdb-shipper", schema: "v1" },
      {
        from: "2025-01-01",
        store: UDSConfig.lokiDefaultStore,
        schema: UDSConfig.lokiDefaultStoreVersion,
      },
    ];
    const lokiConfig = { schema_config: { configs } };
    expect(isConfigUpdateRequired(lokiConfig)).toBe(true);
  });

  // Tests that an update is necessary if no existing configuration matches both the store type and version, regardless of other entries.
  it(`should return true if there is no configuration matching both ${UDSConfig.lokiDefaultStore} and ${UDSConfig.lokiDefaultStoreVersion} even if other configurations are present`, () => {
    const configs = [
      { from: "2025-01-01", store: "boltdb-shipper", schema: "v1" },
      { from: "2025-01-01", store: "another-store", schema: "another-version" },
    ];
    const lokiConfig = { schema_config: { configs } };
    expect(isConfigUpdateRequired(lokiConfig)).toBe(true);
  });

  // Determines the need for an update if another configuration has a 'from' date that is newer than the correct store type and version.
  it(`should return true if the correct ${UDSConfig.lokiDefaultStore} and version exist but the 'from' date is older than another configuration`, () => {
    const configs = [
      { from: "2025-01-03", store: "another-store", schema: "another-version" },
      {
        from: "2025-01-01",
        store: UDSConfig.lokiDefaultStore,
        schema: UDSConfig.lokiDefaultStoreVersion,
      },
    ];
    const lokiConfig = { schema_config: { configs } };
    expect(isConfigUpdateRequired(lokiConfig)).toBe(true);
  });
});
