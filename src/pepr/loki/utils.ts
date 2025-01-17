/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import yaml from "js-yaml";
import { Component, setupLogger } from "../logger";
const log = setupLogger(Component.LOKI);

export interface IndexConfig {
  prefix?: string;
  period?: string;
}

export interface ConfigEntry {
  from: string;
  store: string;
  object_store?: string;
  schema?: string;
  index?: IndexConfig;
}

export interface LokiConfig {
  schema_config?: {
    configs: ConfigEntry[];
  };
}

export interface Secret {
  Raw: {
    metadata?: {
      name?: string;
      annotations?: Record<string, string>;
    };
  };
}

/**
 * Calculates a future date by adding a specified number of days to the current date.
 * @param {number} days - The number of days to add to the current date.
 * @return {string} - The ISO string representation of the future date.
 */
export function calculateFutureDate(days: number): string {
  const now = new Date();
  const futureDate = new Date(now.setDate(now.getDate() + days));
  return futureDate.toISOString().split("T")[0];
}

/**
 * Parses a YAML string into a LokiConfig object.
 * @param {string} data - The YAML string to be parsed.
 * @return {LokiConfig | null} - The parsed configuration object or null if parsing fails.
 */
export function parseLokiConfig(data: string): LokiConfig | null {
  try {
    return yaml.load(data) as LokiConfig;
  } catch (error) {
    log.error(`Failed to parse config: ${error.message}`);
    return null;
  }
}

/**
 * Updates the 'from' date in a configuration entry for the given store type.
 * @param {ConfigEntry[]} configs - Array of configuration entries.
 * @param {string} newDate - The new 'from' date to be set in the configuration.
 * @return {boolean} - True if update is successful, false otherwise.
 */
export function updateConfigDate(
  configs: ConfigEntry[],
  storeType: string,
  newDate: string,
): boolean {
  const config = configs.find(c => c.store === storeType);
  if (!config) {
    log.warn("No schemaConfig entry found");
    return false;
  }
  config.from = newDate;
  return true;
}

/**
 * Encodes a LokiConfig object into a YAML string.
 * @param {LokiConfig} config - The configuration object to encode.
 * @return {string} - The YAML string representation of the configuration.
 */
export function encodeConfig(config: LokiConfig): string {
  return yaml.dump(config);
}

/**
 * Determines if the store type configuration needs to be updated based on the current configuration.
 * This checks if storeType's 'from' date is set properly for the future and after all current schemas.
 */
export function isConfigUpdateRequired(lokiConfig: LokiConfig, storeType: string): boolean {
  const configs = lokiConfig.schema_config?.configs || [];
  const config = configs.find(c => c.store === storeType);

  // Check if storeType in config is missing
  if (!config) {
    return true;
  }

  // Ensure storeType 'from' date is the latest among all configurations
  for (const c of configs) {
    if (c.store !== storeType && new Date(c.from) >= new Date(config.from)) {
      return true;
    }
  }

  // loki schemaConfig is properly configured, no update necessary
  return false;
}
