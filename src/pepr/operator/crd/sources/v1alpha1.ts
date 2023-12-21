import { V1CustomResourceDefinitionVersion, V1JSONSchemaProps } from "@kubernetes/client-node";

export const v1alpha1: V1CustomResourceDefinitionVersion = {
  name: "v1alpha1",
  served: true,
  storage: true,
  schema: {
    openAPIV3Schema: {
      type: "object",
      properties: {
        status: {
          type: "object",
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
                    required: ["name", "port"],
                    properties: {
                      name: {
                        description: "The unique name to use as the VirtualService name",
                        type: "string",
                      },
                      service: {
                        description: "The name of the service to expose (default: name)",
                        type: "string",
                      },
                      port: {
                        description: "The port number to expose",
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
                        description: "The hostname to expose the service on (default: name)",
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
                policies: {
                  type: "object",
                  description: "NetworkPolicy configuration for the package",
                  properties: {
                    disableDefaults: {
                      description: "Disable default UDS NetworkPolicy configurations",
                      type: "array",
                      items: {
                        type: "string",
                        enum: ["dnsLookup", "permissiveNamespace"],
                      },
                    },
                    allow: {
                      description: "Allow specific traffic",
                      type: "array",
                      items: {
                        type: "object",
                        required: ["name", "direction"],
                        properties: {
                          name: {
                            description: "The name of the policy",
                            type: "string",
                          },
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
                            enum: ["KubeAPI"],
                          },
                          port: {
                            description: "The port to allow",
                            type: "number",
                          },
                          protocol: {
                            description:
                              "The protocol (TCP, UDP, or SCTP) to allow. Defaults to TCP.",
                            type: "string",
                            enum: ["TCP", "UDP", "SCTP"],
                          },
                        },
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
