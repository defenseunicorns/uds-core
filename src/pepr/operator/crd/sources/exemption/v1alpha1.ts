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
                required: ["policyName", "matcher"],
                properties: {
                  description: {
                    type: "string",
                    description:
                      "A description of this exemption, this will become part of the exemption name",
                  },
                  policyName: {
                    description: "The name of policy to override",
                    type: "string",
                    enum: ["policyNames..."],
                  },
                  matcher: {
                    description: "Name and namespace of pod to exempt. Regex allowed for name.",
                    type: "object",
                    required: ["namespace", "name"],
                    properties: {
                      namespace: {
                        type: "string",
                      },
                      name: {
                        type: "string",
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
