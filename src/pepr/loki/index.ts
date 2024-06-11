import * as yaml from "js-yaml";
import { Capability, Log, a } from "pepr";

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
    Log.info(
      secret,
      `Processing Secret ${secret.Raw.metadata?.namespace}/${secret.Raw.metadata?.name} for loki schemaconfig date updates.`,
    );

    if (secret.Raw.data && secret.Raw.data["config.yaml"]) {
      // Parse the config.yaml content into a LokiConfig object
      let lokiConfig: LokiConfig;
      try {
        lokiConfig = yaml.load(secret.Raw.data["config.yaml"]) as LokiConfig;
      } catch (e) {
        Log.error(secret, `Failed to parse Loki config.yaml: ${e.message}`);
        return;
      }

      // Check if schema_config and configs exist
      if (lokiConfig.schema_config && Array.isArray(lokiConfig.schema_config.configs)) {
        // Get the v13 schema configuration
        const v13Config = lokiConfig.schema_config.configs.find(config => config.schema === "v13");

        if (v13Config) {
          const currentDate = new Date();

          if (new Date(v13Config.from) < currentDate) {
            // Calculate the new date 2 days in advance
            currentDate.setDate(currentDate.getDate() + 2);

            // Update the v13 schema configuration date
            v13Config.from = currentDate.toISOString().split("T")[0]; // Format as YYYY-MM-DD

            // Ensure limits_config exists and update allow_structured_metadata to false
            if (!lokiConfig.limits_config) {
              lokiConfig.limits_config = {} as LimitsConfig;
            }
            lokiConfig.limits_config.allow_structured_metadata = false;

            // Update the secret with the new config.yaml content
            secret.Raw.data["config.yaml"] = yaml.dump(lokiConfig);
            Log.info(secret.Raw.data["config.yaml"], `Secret config.yaml updated successfully.`);
          } else {
            Log.info(secret, `v13 schema configuration date is valid and in the future.`);
          }
        } else {
          Log.error(secret, `v13 schema configuration not found.`);
        }
      } else {
        Log.error(secret, `Invalid schema_config or configs in Loki config.yaml.`);
      }
    } else {
      Log.error(secret, `No data or config.yaml object found in secret data.`);
    }
  });
