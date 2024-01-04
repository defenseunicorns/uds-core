import { V1CustomResourceDefinitionVersion, V1JSONSchemaProps } from "@kubernetes/client-node";

export const v1alpha1: V1CustomResourceDefinitionVersion = {
  name: "v1alpha1",
  served: true,
  storage: true,
  additionalPrinterColumns: [
    {
      name: "Status",
      type: "string",
      description: "The status of the package",
      jsonPath: ".status.phase",
    },
    {
      name: "Endpoints",
      type: "string",
      description: "Service endpoints exposed by the package",
      jsonPath: ".status.endpoints",
    },
    {
      name: "Network Policies",
      type: "integer",
      description: "The number of network policies created by the package",
      jsonPath: ".status.networkPolicyCount",
    },
    {
      name: "Age",
      type: "date",
      description: "The age of the package",
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
            endpoints: {
              type: "array",
              items: {
                type: "string",
              },
            },
            networkPolicyCount: {
              type: "integer",
            },
          },
          // JS Lib uses _ instead of - which makes the API Server very sad
          "x-kubernetes-preserve-unknown-fields": true,
        } as V1JSONSchemaProps,
        spec: {
          type: "object",
          "x-kubernetes-preserve-unknown-fields": true,
          properties: {
            network: {
              type: "object",
              description: "Network configuration for the package",
              properties: {
                expose: {
                  type: "array",
                  description: "Expose a service on an Istio Gateway",
                  items: {
                    type: "object",
                    required: ["service", "podLabels", "host", "port"],
                    properties: {
                      service: {
                        description: "The name of the service to expose",
                        type: "string",
                      },
                      podLabels: {
                        description:
                          "Labels to match pods in the namespace to apply the policy to. Leave empty to apply to all pods in the namespace",
                        type: "object",
                        additionalProperties: {
                          type: "string",
                        },
                      },
                      port: {
                        description: "The port number to expose",
                        minimum: 1,
                        maximum: 65535,
                        type: "number",
                      },
                      gateway: {
                        description:
                          "The name of the gateway to expose the service on (default: tenant)",
                        enum: ["admin", "tenant", "passthrough"],
                        type: "string",
                        default: "tenant",
                      },
                      host: {
                        description: "The hostname to expose the service on",
                        type: "string",
                      },
                      mode: {
                        description: "The mode to use when exposing the service",
                        enum: ["http", "tcp"],
                        type: "string",
                        default: "http",
                      },
                    },
                  },
                },
                allow: {
                  description: "Allow specific traffic (namespace will have a default-deny policy)",
                  type: "array",
                  items: {
                    type: "object",
                    required: ["direction"],
                    properties: {
                      labels: {
                        description: "The labels to apply to the policy",
                        type: "object",
                        additionalProperties: {
                          type: "string",
                        },
                      },
                      direction: {
                        description: "The direction of the traffic",
                        enum: ["Ingress", "Egress"],
                        type: "string",
                      },
                      podLabels: {
                        description:
                          "Labels to match pods in the namespace to apply the policy to. Leave empty to apply to all pods in the namespace",
                        type: "object",
                        additionalProperties: {
                          type: "string",
                        },
                      },
                      remoteNamespaceLabels: {
                        description: "The remote namespace selector labels",
                        type: "object",
                        additionalProperties: {
                          type: "string",
                        },
                      },
                      remotePodLabels: {
                        description: "The remote pod selector labels",
                        type: "object",
                        additionalProperties: {
                          type: "string",
                        },
                      },
                      remoteGenerated: {
                        description: "Custom generated remote selector for the policy",
                        type: "string",
                        enum: ["KubeAPI", "IntraNamespace", "CloudMetadata", "Anywhere"],
                      },
                      port: {
                        description: "The port to allow",
                        minimum: 1,
                        maximum: 65535,
                        type: "number",
                      },
                      protocol: {
                        description: "The protocol (TCP, UDP, or SCTP) to allow. Defaults to TCP.",
                        type: "string",
                        enum: ["TCP", "UDP", "SCTP"],
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
