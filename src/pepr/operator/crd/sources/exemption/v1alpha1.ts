import { V1CustomResourceDefinitionVersion, V1JSONSchemaProps } from "@kubernetes/client-node";

export const v1alpha1: V1CustomResourceDefinitionVersion = {
  name: "v1alpha1",
  served: true,
  storage: true,
  additionalPrinterColumns: [
    {
      name: "Status",
      type: "string",
      description: "The status of the exemption",
      jsonPath: ".status.phase",
    },
    {
      name: "Exemptions",
      type: "string",
      description: "Titles of the exemptions",
      jsonPath: ".status.titles",
    },
    {
      name: "Age",
      type: "date",
      description: "The age of the exemption",
      jsonPath: ".metadata.creationTimestamp",
    },
  ],
  subresources: {
    status: {},
  },
  schema: {
    openAPIV3Schema: {
      type: "object",
      properties: {
        status: {
          type: "object",
          properties: {
            observedGeneration: {
              type: "integer",
            },
            phase: {
              enum: ["Pending", "Ready", "Failed"],
              type: "string",
            },
            titles: {
              type: "array",
              items: {
                type: "string",
              },
            },
          },
        } as V1JSONSchemaProps,
        spec: {
          type: "object",
          properties: {
            exemptions: {
              type: "array",
              description: "Policy exemptions",
              items: {
                type: "object",
                required: ["policies", "matcher"],
                properties: {
                  title: {
                    type: "string",
                    description: "title to give the exemption for reporting purposes",
                  },
                  description: {
                    type: "string",
                    description: "Reasons as to why this exemption is needed",
                  },
                  policies: {
                    description: "A list of policies to override",
                    type: "array",
                    items: {
                      type: "string",
                      enum: [
                        "DisallowHostNamespaces",
                        "DisallowNodePortServices",
                        "DisallowPrivileged",
                        "DisallowSELinuxOptions",
                        "DropAllCapabilities",
                        "RequireNonRootUser",
                        "RestrictCapabilities",
                        "RestrictExternalNames",
                        "RestrictHostPathWrite",
                        "RestrictHostPorts",
                        "RestrictProcMount",
                        "RestrictSeccomp",
                        "RestrictSELinuxType",
                        "RestrictVolumeTypes",
                      ],
                    },
                  },
                  matcher: {
                    description: "Resource to exempt (Regex allowed for name)",
                    type: "object",
                    required: ["namespace", "name"],
                    properties: {
                      namespace: {
                        type: "string",
                      },
                      name: {
                        type: "string",
                      },
                      kind: {
                        type: "string",
                        enum: ["pod", "service"],
                        default: "pod",
                      },
                    },
                  },
                },
              },
            },
          },
        } as V1JSONSchemaProps,
      },
    },
  },
};
