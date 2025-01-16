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
    if (secret.Raw.metadata?.annotations?.[updatedAnnotationKey]) {
      log.info(`Annotation already updated for ${secret.Raw.metadata?.name}`);
      return;
    }

    const futureDate = calculateFutureDate(2);
    if (secret.Raw.data && secret.Raw.data["config.yaml"]) {
      const lokiConfig = parseLokiConfig(secret.Raw.data["config.yaml"]);
      if (!lokiConfig || !updateConfigDate(lokiConfig.schema_config?.configs || [], futureDate)) {
        return;
      }

      secret.Raw.data["config.yaml"] = encodeConfig(lokiConfig);
      updateSecretAnnotations(secret, updatedAnnotationKey);
      log.info(`Config and annotations updated for ${secret.Raw.metadata?.name}`);
    } else {
      handleError(`Missing 'data' field or 'config.yaml' key in ${secret.Raw.metadata?.name}`);
    }
  });
