import { Capability, K8s, kind } from "pepr";
import { Component, setupLogger } from "../logger";

const log = setupLogger(Component.LOKI);

export const loki = new Capability({
  name: "loki",
  description: "UDS Core Capability for the Loki stack.",
});

const { When } = loki;

When(kind.ConfigMap)
  .IsCreatedOrUpdated()
  .InNamespace("loki")
  .WithName("loki-schema-config")
  .Mutate(async cm => {
    const now = new Date();
    const futureDate = new Date(now.setDate(now.getDate() + 2)).toISOString().split("T")[0];

    // Update schemaChangeDate in ConfigMap
    cm.Raw.data = cm.Raw.data || {};
    if (!cm.Raw.data.schemaChangeDate || new Date(cm.Raw.data.schemaChangeDate) < now) {
      cm.Raw.data.schemaChangeDate = futureDate;
      log.info(`Set schemaChangeDate to ${futureDate} in ConfigMap ${cm.Raw.metadata?.name}`);
    } else {
      log.info(
        `schemaChangeDate ${cm.Raw.data.schemaChangeDate} is already up-to-date in ConfigMap ${cm.Raw.metadata?.name}`,
      );
    }

    // Update the Secret with the new schemaChangeDate
    const secretName = "loki-config-secret";
    const namespace = "loki";

    try {
      // Fetch the existing Secret
      const secret = await K8s(kind.Secret).InNamespace(namespace).Get(secretName);

      if (secret) {
        // Check if 'data' exists in the Secret
        if (!secret.data || !secret.data["config.yaml"]) {
          throw new Error(`Secret ${secretName} is missing the 'data' field or 'config.yaml' key.`);
        }

        // Decode and parse the config.yaml from the Secret
        const config = JSON.parse(
          Buffer.from(secret.data["config.yaml"], "base64").toString("utf8"),
        );

        // Update the schemaChangeDate in the config
        const schemaConfigs = config.schema_config.configs;
        const tsdbConfig = schemaConfigs.find((c: { store: string }) => c.store === "tsdb");
        if (tsdbConfig) {
          tsdbConfig.from = cm.Raw.data.schemaChangeDate;
          log.info(`Updated TSDB schema "from" date to ${tsdbConfig.from} in Secret ${secretName}`);
        }

        // Encode the updated config back into the Secret
        secret.data["config.yaml"] = Buffer.from(JSON.stringify(config)).toString("base64");

        // Apply the updated Secret
        await K8s(kind.Secret).Apply(secret);
        log.info(`Updated Secret ${secretName} in namespace ${namespace}`);
      } else {
        log.error(`Secret ${secretName} not found in namespace ${namespace}`);
      }
    } catch (error) {
      log.error(`Error updating Secret ${secretName}: ${error.message}`);
    }
  });
