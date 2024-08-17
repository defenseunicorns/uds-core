import * as yaml from "js-yaml";
import { Capability, a } from "pepr";
import { Component, setupLogger } from "../logger";

const log = setupLogger(Component.LOKI);

export const loki = new Capability({
  name: "loki",
  description: "UDS Core Capability for the Loki stack.",
});

const { When } = loki;

// Define the type for the YAML configuration
interface SchemaConfig {
  from: string;
  store: string;
  object_store: string;
  schema: string;
  index: {
    prefix: string;
    period: string;
  };
}

interface LimitsConfig {
  allow_structured_metadata: boolean;
}

interface LokiConfig {
  auth_enabled: boolean;
  chunk_store_config: object;
  common: object;
  frontend: object;
  frontend_worker: object;
  index_gateway: object;
  limits_config: LimitsConfig;
  memberlist: object;
  pattern_ingester: object;
  query_range: object;
  ruler: object;
  runtime_config: object;
  schema_config: {
    configs: SchemaConfig[];
  };
  server: object;
  storage_config: object;
  tracing: object;
}

When(a.Secret)
  .IsCreatedOrUpdated()
  .WithLabel("app.kubernetes.io/instance", "loki")
  .WithLabel("app.kubernetes.io/name", "loki")
  .Mutate(async secret => {
    log.info(
      secret,
      `Processing Secret ${secret.Raw.metadata?.namespace}/${secret.Raw.metadata?.name} for Loki schema config date updates.`,
    );

    // Check if the secret contains the "config.yaml" data
    if (secret.Raw.data && secret.Raw.data["config.yaml"]) {
      let lokiConfig: LokiConfig;

      // Parse the "config.yaml" content into a LokiConfig object
      try {
        lokiConfig = yaml.load(secret.Raw.data["config.yaml"]) as LokiConfig;
      } catch (e) {
        log.error(secret, `Failed to parse Loki config.yaml: ${e.message}`);
        return;
      }

      // Check if the schema_config and its configs array exist
      if (lokiConfig.schema_config && Array.isArray(lokiConfig.schema_config.configs)) {
        // Find the v13 schema configuration in the array
        const v13Config = lokiConfig.schema_config.configs.find(config => config.schema === "v13");

        if (v13Config) {
          // Retrieve the previously stored date from annotations
          const storedDate = secret.Raw.metadata?.annotations?.["loki.v13.config.date"];
          const incomingDate = v13Config.from;

          if (!storedDate) {
            // If no date is stored, generate a new date 2 days in the future
            const currentDate = new Date();
            currentDate.setDate(currentDate.getDate() + 2);
            const newDate = currentDate.toISOString().split("T")[0]; // Format as YYYY-MM-DD

            // Update the v13 schema configuration with the new date
            v13Config.from = newDate;

            // Ensure limits_config exists and set allow_structured_metadata to false
            if (!lokiConfig.limits_config) {
              lokiConfig.limits_config = {} as LimitsConfig;
            }
            lokiConfig.limits_config.allow_structured_metadata = false;

            // Update the secret with the new config.yaml content
            secret.Raw.data["config.yaml"] = yaml.dump(lokiConfig);

            // Store the generated date in an annotation for future reference
            secret.Raw.metadata!.annotations = {
              ...secret.Raw.metadata!.annotations,
              "loki.v13.config.date": newDate,
            };

            log.info(`Secret config.yaml updated successfully with new date ${newDate}.`);
          } else if (incomingDate === storedDate) {
            log.info(`Incoming date matches stored date (${storedDate}). No update needed.`);
          } else {
            // Log to catch potential manual changes or config drift.
            log.warn(`Incoming date (${incomingDate}) does not match stored date (${storedDate}). No update made.`);
          }
        } else {
          log.error(secret, `v13 schema configuration not found.`);
        }
      } else {
        log.error(secret, `Invalid schema_config or configs in Loki config.yaml.`);
      }
    } else {
      log.error(secret, `No data or config.yaml object found in secret data.`);
    }
  });
