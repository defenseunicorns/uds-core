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
                required: ["policies", "matcher"],
                properties: {
                  description: {
                    type: "string",
                    description:
                      "A description of this exemption, this will become part of the exemption name",
                  },
                  policies: {
                    description: "A list of policies to override",
                    type: "array",
                    items: {
                      type: "string",
                      enum: [
                        "Disallow_Host_Namespaces",
                        "Disallow_NodePort_Services",
                        "Disallow_Privileged",
                        "Disallow_SELinux_Options",
                        "Drop_All_Capabilities",
                        "Require_Non_Root_User",
                        "Restrict_Capabilities",
                        "Restrict_External_Names",
                        "Restrict_HostPath_Write",
                        "Restrict_Host_Ports",
                        "Restrict_Proc_Mount",
                        "Restrict_Seccomp",
                        "Restrict_SELinux_Type",
                        "Restrict_Volume_Types",
                      ],
                    },
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
