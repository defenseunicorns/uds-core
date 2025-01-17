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
  isConfigUpdateRequired,
  parseLokiConfig,
  updateConfigDate,
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
    if (!secret.Raw.data || !secret.Raw.data["config.yaml"]) {
      log.error(`Missing 'data' field or 'config.yaml' key in ${secret.Raw.metadata?.name}`);
      return;
    }

    const lokiConfig = parseLokiConfig(secret.Raw.data["config.yaml"]);
    if (!lokiConfig) {
      log.error("Failed to parse Loki configuration.");
      return;
    }

    if (isConfigUpdateRequired(lokiConfig, UDSConfig.lokiDefaultStore)) {
      const futureDate = calculateFutureDate(2);
      if (
        updateConfigDate(
          lokiConfig.schema_config?.configs || [],
          UDSConfig.lokiDefaultStore,
          futureDate,
        )
      ) {
        secret.Raw.data["config.yaml"] = encodeConfig(lokiConfig);
        log.info(
          `Loki schemaConfig configuration updated and saved for ${secret.Raw.metadata?.name}`,
        );
      } else {
        log.error(
          `Failed to update Loki schemaConfig configuration for ${secret.Raw.metadata?.name}`,
        );
      }
    } else {
      log.info(
        `No update required for Loki schemaConfig configuration for ${secret.Raw.metadata?.name}`,
      );
    }
  });
