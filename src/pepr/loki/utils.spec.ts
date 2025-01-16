/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { afterAll, beforeAll, describe, expect, it, jest } from "@jest/globals";
import { Component, setupLogger } from "../logger";
import {
  calculateFutureDate,
  encodeConfig,
  parseLokiConfig,
  Secret,
  updateConfigDate,
  updateSecretAnnotations,
} from "./utils";

/**
 * Mocks the logger module to prevent real logging during tests and ensure control over logger behavior.
 */
jest.mock("../logger", () => ({
  setupLogger: jest.fn().mockReturnValue({
    warn: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn(),
    fatal: jest.fn(),
  }),
  Component: {
    LOKI: "LOKI",
  },
}));

const logger = setupLogger(Component.LOKI);

/**
 * Tests the calculateFutureDate function to ensure it correctly computes a future date based on a specified number of days.
 */
describe("calculateFutureDate", () => {
  beforeAll(() => {
    jest.spyOn(Date, "now").mockImplementation(() => new Date("2023-01-01T00:00:00Z").getTime());
    const originalDate = Date;
    jest.spyOn(global, "Date").mockImplementation((...args) => {
      return args.length ? new originalDate(...args) : new originalDate("2023-01-01T00:00:00Z");
    });
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it("should return a date string two days in the future", () => {
    const result = calculateFutureDate(2);
    expect(result).toBe("2023-01-03");
  });
});

/**
 * Tests the parseLokiConfig function to ensure it correctly parses a valid YAML string into a LokiConfig object.
 */
describe("parseLokiConfig", () => {
  it("should parse valid YAML string into an object", () => {
    const yamlString = `
      schema_config:
        configs:
          - from: "2023-01-01"
            store: "tsdb"
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
            store: "tsdb",
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
    const badYaml = `: I am not YAML!`;
    expect(parseLokiConfig(badYaml)).toBeNull();
  });
});

/**
 * Tests the updateConfigDate function to ensure it correctly updates the 'from' date in the specified configuration entry.
 */
describe("updateConfigDate", () => {
  it("should update the from date in the TSDB config", () => {
    const configs = [
      {
        from: "2023-01-01",
        store: "tsdb",
      },
    ];
    const result = updateConfigDate(configs, "2023-01-10");
    expect(result).toBeTruthy();
    expect(configs[0].from).toBe("2023-01-10");
  });

  it("should return false if no TSDB config is found", () => {
    const configs = [{ from: "2023-01-01", store: "other" }];
    expect(updateConfigDate(configs, "2023-01-10")).toBeFalsy();
  });
});

/**
 * Tests the encodeConfig function to ensure it correctly encodes a LokiConfig object into a YAML string.
 */
describe("encodeConfig", () => {
  it("should encode a config object to a YAML string", () => {
    const config = {
      schema_config: {
        configs: [
          {
            from: "2023-01-01",
            store: "tsdb",
            index: {
              prefix: "loki_",
              period: "24h",
            },
          },
        ],
      },
    };
    const yamlString = encodeConfig(config);
    expect(yamlString).toMatch(/tsdb/);
    expect(yamlString).toMatch(/loki_/);
  });
});

/**
 * Tests the updateSecretAnnotations function to ensure it correctly handles adding annotations to a secret and handles missing metadata appropriately.
 */
describe("updateSecretAnnotations", () => {
  it("should add annotations when metadata is present", () => {
    const secret: Secret = {
      Raw: {
        metadata: {
          annotations: {},
        },
      },
    };

    updateSecretAnnotations(secret, "loki.tsdb.mutated");
    if (secret.Raw.metadata && secret.Raw.metadata.annotations) {
      expect(secret.Raw.metadata.annotations["loki.tsdb.mutated"]).toBe("true");
    }
  });

  it("should log a warning when metadata is missing", () => {
    const secret: Secret = {
      Raw: {
        metadata: undefined,
      },
    };

    updateSecretAnnotations(secret, "loki.tsdb.mutated");
    expect(logger.warn).toHaveBeenCalledWith("Metadata is missing; annotations cannot be updated.");
  });
});
