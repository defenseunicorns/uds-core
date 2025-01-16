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
    handleError(`Failed to parse config: ${error.message}`);
    return null;
  }
}

/**
 * Logs an error message to the console.
 * @param {string} message - The error message to log.
 */
export function handleError(message: string): void {
  log.error(message);
}

/**
 * Updates the 'from' date in a configuration entry for 'tsdb' store.
 * @param {ConfigEntry[]} configs - Array of configuration entries.
 * @param {string} newDate - The new 'from' date to be set in the configuration.
 * @return {boolean} - True if update is successful, false otherwise.
 */
export function updateConfigDate(configs: ConfigEntry[], newDate: string): boolean {
  const tsdbConfig = configs.find(c => c.store === "tsdb");
  if (!tsdbConfig) {
    log.warn("No TSDB config found");
    return false;
  }
  tsdbConfig.from = newDate;
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
 * Updates or initializes the annotations on a Kubernetes secret.
 * @param {Secret} secret - The secret to update.
 * @param {string} key - The key of the annotation to add or update.
 */
export function updateSecretAnnotations(secret: Secret, key: string): void {
  if (secret.Raw.metadata) {
    secret.Raw.metadata.annotations = {
      ...(secret.Raw.metadata.annotations || {}),
      [key]: "true",
    };
  } else {
    log.warn("Metadata is missing; annotations cannot be updated.");
  }
}
