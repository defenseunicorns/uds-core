/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { Capability, kind } from "pepr";
import { Component, setupLogger } from "../logger";
import {
  calculateFutureDate,
  encodeConfig,
  handleError,
  parseLokiConfig,
  updateConfigDate,
  updateSecretAnnotations,
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
    const updatedAnnotationKey = "loki.tsdb.mutated";

    // Check if the secret already has the processed annotation, log if it does, and skip further processing.
    if (secret.Raw.metadata?.annotations?.[updatedAnnotationKey]) {
      log.info(`Annotation already updated for ${secret.Raw.metadata?.name}`);
      return;
    }

    const futureDate = calculateFutureDate(2);

    // Ensure the secret contains 'config.yaml' data before proceeding.
    if (secret.Raw.data && secret.Raw.data["config.yaml"]) {
      const lokiConfig = parseLokiConfig(secret.Raw.data["config.yaml"]);

      // If parsing fails or updating the configuration date fails, stop processing.
      if (!lokiConfig || !updateConfigDate(lokiConfig.schema_config?.configs || [], futureDate)) {
        return;
      }

      // Encode the updated configuration back to YAML and save it back to the secret.
      secret.Raw.data["config.yaml"] = encodeConfig(lokiConfig);

      updateSecretAnnotations(secret, updatedAnnotationKey);
      log.info(`Config and annotations updated for ${secret.Raw.metadata?.name}`);
    } else {
      handleError(`Missing 'data' field or 'config.yaml' key in ${secret.Raw.metadata?.name}`);
    }
  });
