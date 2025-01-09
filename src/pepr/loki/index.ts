/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import yaml from "js-yaml";
import { Capability, kind } from "pepr";
import { Component, setupLogger } from "../logger";

const log = setupLogger(Component.LOKI);

export const loki = new Capability({
  name: "loki",
  description: "UDS Core Capability for the Loki stack.",
});

const { When } = loki;

interface LokiConfig {
  schema_config?: {
    configs: {
      from: string;
      store: string;
      object_store?: string;
      schema?: string;
      index?: {
        prefix?: string;
        period?: string;
      };
    }[];
  };
}

When(kind.Secret)
  .IsCreatedOrUpdated()
  .InNamespace("loki")
  .WithName("loki")
  .Mutate(async secret => {
    const updatedAnnotationKey = "loki.tsdb.mutated";

    // Exit early if the date has already been updated
    if (secret.Raw.metadata?.annotations?.[updatedAnnotationKey]) {
      log.info(`Secret ${secret.Raw.metadata?.name} already has the date updated annotation.`);
      return;
    }

    const now = new Date();
    const futureDate = new Date(now.setDate(now.getDate() + 2)).toISOString().split("T")[0];

    // Check if the secret contains the "config.yaml" data
    if (secret.Raw.data && secret.Raw.data["config.yaml"]) {
      let lokiConfig: LokiConfig;

      // Parse the "config.yaml" content into a LokiConfig object
      try {
        lokiConfig = yaml.load(secret.Raw.data["config.yaml"]) as LokiConfig;
      } catch (e) {
        log.error(`Failed to parse Loki config.yaml: ${(e as Error).message}`);
        return;
      }

      // Validate and update the schema_config
      const schemaConfigs = lokiConfig.schema_config?.configs;
      if (!Array.isArray(schemaConfigs)) {
        log.error("Missing or invalid schema_config.configs in config.yaml");
      }

      const tsdbConfig = schemaConfigs?.find(c => c.store === "tsdb");
      if (tsdbConfig) {
        tsdbConfig.from = futureDate;
      } else {
        log.warn(`No TSDB config found in schema_config of Secret ${secret.Raw.metadata?.name}`);
        return; // Exit early if TSDB config is missing
      }

      // Serialize the updated configuration back to YAML and store it in the Secret
      secret.Raw.data["config.yaml"] = yaml.dump(lokiConfig);

      // Add TSDB mutated annotation to secret
      secret.Raw.metadata!.annotations = {
        ...(secret.Raw.metadata!.annotations || {}),
        [updatedAnnotationKey]: "true",
      };

      log.info(`Updated and encoded config.yaml back into Secret ${secret.Raw.metadata?.name}`);
    } else {
      log.error(
        `Secret ${secret.Raw.metadata?.name} is missing the 'data' field or 'config.yaml' key.`,
      );
    }
  });
