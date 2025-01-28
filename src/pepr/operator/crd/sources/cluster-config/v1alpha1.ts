import { V1CustomResourceDefinitionVersion, V1JSONSchemaProps } from "@kubernetes/client-node";

export const v1alpha1: V1CustomResourceDefinitionVersion = {
  name: "v1alpha1",
  served: true,
  storage: true,
  schema: {
    openAPIV3Schema: {
      type: "object",
      properties: {
        spec: {
          type: "object",
          properties: {
            attributes: {
              type: "object",
              properties: {
                clusterName: {
                  type: "string",
                  description: "Friendly name to associate with your UDS cluster",
                },
                tags: {
                  type: "array",
                  description: "Tags to apply to your UDS cluster",
                  items: {
                    type: "string",
                  },
                },
              },
            },
            networking: {
              type: "object",
              properties: {
                kubeapiCIDR: {
                  type: "string",
                  description: "MICAH HALP",
                },
                kubenodeCIDRS: {
                  type: "array",
                  description: "MICAH HALP",
                  items: {
                    type: "string",
                    pattern:
                      "^(([0-9]{1,3}\\.){3}[0-9]{1,3}\\/[0-9]+)|(([a-fA-F0-9:]+:+)+[a-fA-F0-9:]+(/[0-9]+)?)$", // Matches IPv4 and IPv6 CIDR
                  },
                },
              },
            },
            expose: {
              type: "object",
              properties: {
                domain: {
                  type: "string",
                  description: "Domain all cluster services will be exposed on",
                },
                adminDomain: {
                  type: "string",
                  description:
                    "Domain all cluster services on the admin gateawy will be exposed on",
                },
                caCert: {
                  type: "string",
                  description: "MICAH HALP",
                },
              },
            },
            policy: {
              type: "object",
              properties: {
                allowAllNsExemptions: {
                  type: "boolean",
                  description:
                    "Allow UDS Exemption custom resources to live in any namespace (default false)",
                  default: false,
                },
              },
            },
            logLevel: {
              type: "string",
              enum: ["debug", "info", "warn", "error"],
            },
          },
        } as V1JSONSchemaProps,
      },
      required: ["spec"],
    },
  },
};
