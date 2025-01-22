/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { Capability, kind } from "pepr";
import { UDSConfig } from "../config";
import { Component, setupLogger } from "../logger";
import {
  calculateFutureDate,
  encodeConfig,
  getConfigEntry,
  isConfigUpdateRequired,
  parseLokiConfig,
} from "./utils";

const log = setupLogger(Component.LOKI);

export const loki = new Capability({
  name: "loki",
  description: "UDS Core Capability for the Loki stack.",
});

const { When } = loki;

When(kind.Secret)
  .IsCreatedOrUpdated()
  .InNamespace("loki")
  .WithName("loki")
  .Mutate(async secret => {
    if (UDSConfig.managedLokiSchema) {
      if (!secret.Raw.data || !secret.Raw.data["config.yaml"] || !secret.Raw.metadata) {
        log.error(`Missing 'data' field or 'config.yaml' key in ${secret.Raw.metadata?.name}`);
        return;
      }

      const lokiConfig = parseLokiConfig(secret.Raw.data["config.yaml"]);
      if (!lokiConfig) {
        log.error("Failed to parse Loki configuration.");
        return;
      }

      const futureDate = calculateFutureDate(2);
      secret.Raw.metadata.annotations = secret.Raw.metadata.annotations || {};

      const schemaConfig = getConfigEntry(lokiConfig.schema_config?.configs || []);
      if (schemaConfig && !secret.Raw.metadata.annotations["uds.dev/schemaConfigDate"]) {
        secret.Raw.metadata.annotations["uds.dev/schemaConfigDate"] = schemaConfig.from;
        log.info(`Loki config secret updated for schemaConfigDate annotation`);
      }

      if (schemaConfig && isConfigUpdateRequired(lokiConfig)) {
        schemaConfig.from = futureDate;
        secret.Raw.data["config.yaml"] = encodeConfig(lokiConfig);
        secret.Raw.metadata.annotations["uds.dev/schemaConfigDate"] = futureDate;
        log.info(
          `Loki schemaConfig configuration updated and saved for ${secret.Raw.metadata?.name}`,
        );
      } else {
        log.info(
          `No update required for Loki schemaConfig configuration for ${secret.Raw.metadata?.name}`,
        );
      }
    }
  });
