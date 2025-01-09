// /**
//  * Copyright 2024 Defense Unicorns
//  * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
//  */

// import { describe, expect, it } from "@jest/globals";
// import yaml from "js-yaml";
// import { K8s, kind } from "pepr";

// interface TSDBConfig {
//   from: string;
//   store: string;
//   object_store?: string;
//   schema?: string;
//   index?: {
//     prefix?: string;
//     period?: string;
//   };
// }

// interface LokiConfig {
//   schema_config?: {
//     configs: TSDBConfig[];
//   };
// }

// const failIfReached = () => expect(true).toBe(false);

// describe("Loki Secret Mutation", () => {
//   const baseConfigYaml = yaml.dump({
//     schema_config: {
//       configs: [
//         { from: "2022-01-11", store: "boltdb-shipper" },
//         { from: "2099-12-31", store: "tsdb" },
//       ],
//     },
//   });

//   const mockSecret = (annotations: Record<string, string> = {}, configYaml: string | null = null) => ({
//     metadata: {
//       name: "loki",
//       namespace: "loki",
//       annotations,
//     },
//     data: configYaml
//       ? {
//           "config.yaml": Buffer.from(configYaml).toString("base64"),
//         }
//       : {},
//   });

//   it("should update the TSDB schema 'from' date and add the annotation", async () => {
//     const secret = mockSecret({}, baseConfigYaml);

//     const now = new Date();
//     const futureDate = new Date(now.setDate(now.getDate() + 2)).toISOString().split("T")[0];

//     return K8s(kind.Secret)
//       .Apply(secret)
//       .then(failIfReached)
//       .catch((e: Error) => {
//         expect(e).toMatchObject({
//           ok: false,
//           data: {
//             message: expect.stringContaining(`Updated and encoded config.yaml back into Secret loki`),
//           },
//         });

//         // Decode and verify the updated config.yaml
//         const configYamlBase64 = secret.data?.["config.yaml"];
//         expect(configYamlBase64).toBeDefined(); // Ensure the config.yaml key exists
//         const updatedConfig = yaml.load(
//           Buffer.from(configYamlBase64!, "base64").toString("utf-8")
//         ) as LokiConfig;

//         const tsdbConfig = updatedConfig.schema_config?.configs.find((c) => c.store === "tsdb");
//         expect(tsdbConfig?.from).toBe(futureDate);

//         // Verify the annotation is added
//         expect(secret.metadata.annotations["loki.tsdb.mutated"]).toBe("true");
//       });
//   });

//   it("should not update the Secret if the annotation exists", async () => {
//     const secret = mockSecret({ "loki.tsdb.mutated": "true" }, baseConfigYaml);

//     return K8s(kind.Secret)
//       .Apply(secret)
//       .then(failIfReached)
//       .catch((e: Error) => {
//         expect(e).toMatchObject({
//           ok: false,
//           data: {
//             message: expect.stringContaining(
//               "Secret loki already has the date updated annotation."
//             ),
//           },
//         });

//         // Verify the original TSDB schema "from" date remains unchanged
//         const configYamlBase64 = secret.data?.["config.yaml"];
//         expect(configYamlBase64).toBeDefined(); // Ensure the config.yaml key exists
//         const config = yaml.load(
//           Buffer.from(configYamlBase64!, "base64").toString("utf-8")
//         ) as LokiConfig;

//         const tsdbConfig = config.schema_config?.configs.find((c) => c.store === "tsdb");
//         expect(tsdbConfig?.from).toBe("2099-12-31");
//       });
//   });

//   it("should log an error if 'config.yaml' is missing", async () => {
//     const secret = mockSecret();

//     return K8s(kind.Secret)
//       .Apply(secret)
//       .then(failIfReached)
//       .catch((e: Error) => {
//         expect(e).toMatchObject({
//           ok: false,
//           data: {
//             message: expect.stringContaining(
//               "Secret loki is missing the 'data' field or 'config.yaml' key."
//             ),
//           },
//         });
//       });
//   });

//   it("should log an error if schema_config is invalid", async () => {
//     const invalidYaml = yaml.dump({ schema_config: {} });
//     const secret = mockSecret({}, invalidYaml);

//     return K8s(kind.Secret)
//       .Apply(secret)
//       .then(failIfReached)
//       .catch((e: Error) => {
//         expect(e).toMatchObject({
//           ok: false,
//           data: {
//             message: expect.stringContaining("Missing or invalid schema_config.configs in config.yaml"),
//           },
//         });
//       });
//   });

//   it("should log a warning if no TSDB config is found", async () => {
//     const yamlWithoutTsdb = yaml.dump({
//       schema_config: {
//         configs: [{ from: "2022-01-11", store: "boltdb-shipper" }],
//       },
//     });
//     const secret = mockSecret({}, yamlWithoutTsdb);

//     return K8s(kind.Secret)
//       .Apply(secret)
//       .then(failIfReached)
//       .catch((e: Error) => {
//         expect(e).toMatchObject({
//           ok: false,
//           data: {
//             message: expect.stringContaining("No TSDB config found in schema_config of Secret loki"),
//           },
//         });
//       });
//   });
// });
