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

export function calculateFutureDate(days: number): string {
  const now = new Date();
  const futureDate = new Date(now.setDate(now.getDate() + days));
  return futureDate.toISOString().split("T")[0];
}

export function parseLokiConfig(data: string): LokiConfig | null {
  try {
    return yaml.load(data) as LokiConfig;
  } catch (error) {
    handleError(`Failed to parse config: ${error.message}`);
    return null;
  }
}

export function handleError(message: string): void {
  log.error(message);
}

export function updateConfigDate(configs: ConfigEntry[], newDate: string): boolean {
  const tsdbConfig = configs.find(c => c.store === "tsdb");
  if (!tsdbConfig) {
    log.warn("No TSDB config found");
    return false;
  }
  tsdbConfig.from = newDate;
  return true;
}

export function encodeConfig(config: LokiConfig): string {
  return yaml.dump(config);
}

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
