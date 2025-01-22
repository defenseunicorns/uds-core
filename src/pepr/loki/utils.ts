/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import yaml from "js-yaml";
import { UDSConfig } from "../config";
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
 * Useful for setting expiration dates or scheduling future events.
 * @param {number} days - The number of days to add to the current date.
 * @return {string} - The ISO string representation of the future date in 'YYYY-MM-DD' format.
 */
export function calculateFutureDate(days: number): string {
  const now = new Date();
  const futureDate = new Date(now.setDate(now.getDate() + days));
  return futureDate.toISOString().split("T")[0];
}

/**
 * Parses a YAML string into a LokiConfig object. This function is essential for initializing
 * configuration from YAML files which is typical in environments where Loki is used.
 * @param {string} data - The YAML string to be parsed.
 * @return {LokiConfig | null} - The parsed configuration object or null if parsing fails,
 * indicating invalid or corrupt configuration data.
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
 * Retrieves a configuration entry from a list of configurations based on specified store and schema.
 * This is particularly useful for accessing specific Loki configurations that need to be updated or validated.
 * @param {ConfigEntry[]} configs - Array of configuration entries.
 * @return {ConfigEntry | null} - The found configuration entry or null if not found, which may trigger a fallback or default configuration setup.
 */
export function getConfigEntry(configs: ConfigEntry[]): ConfigEntry | null {
  const config = configs.find(
    c => c.store === UDSConfig.lokiDefaultStore && c.schema === UDSConfig.lokiDefaultStoreVersion,
  );
  if (!config) {
    log.warn(
      `No configuration entry found for store type: ${UDSConfig.lokiDefaultStore} and schema version: ${UDSConfig.lokiDefaultStoreVersion}`,
    );
    return null;
  }
  return config;
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
 * Determines if a configuration update is necessary by comparing the 'from' date of a specified
 * store type and version against other configurations. This helps maintain the most current
 * configuration active and avoids using outdated settings.
 * @param {LokiConfig} lokiConfig - The Loki configuration object to check.
 * @return {boolean} - True if an update is needed (no matching config found or a newer 'from' date exists),
 * false otherwise.
 */
export function isConfigUpdateRequired(lokiConfig: LokiConfig): boolean {
  const configs = lokiConfig.schema_config?.configs || [];
  const targetConfig = configs.find(
    c => c.store === UDSConfig.lokiDefaultStore && c.schema === UDSConfig.lokiDefaultStoreVersion,
  );

  // Check for config containing latest storeType and schemaVersion
  if (!targetConfig) {
    return true; // No matching config, update is required
  }

  // Check 'from' date is the latest of all configs
  const targetFromDate = new Date(targetConfig.from);
  for (const c of configs) {
    if (new Date(c.from) > targetFromDate) {
      return true; // Found a configuration with a newer date, update required
    }
  }

  // No more recent 'from' date found, no update required
  return false;
}
