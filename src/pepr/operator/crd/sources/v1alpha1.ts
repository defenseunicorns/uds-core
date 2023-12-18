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
                    required: ["service", "port", "gateway", "host"],
                    properties: {
                      service: {
                        description: "The name of the service to expose",
                        type: "string",
                      },
                      port: {
                        description: "The port number to expose",
                        type: "number",
                      },
                      gateway: {
                        description: "The name of the gateway to expose the service on",
                        enum: ["admin", "tenant", "passthrough"],
                        type: "string",
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
                        required: ["name", "direction", "podSelector"],
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
                          podSelector: {
                            description: "The local pod selector to apply the policy to",
                            type: "object",
                            properties: {
                              matchLabels: {
                                description: "The labels to match",
                                type: "object",
                                additionalProperties: {
                                  type: "string",
                                },
                              },
                            },
                          },
                          remoteNamespaceSelector: {
                            description: "The remote namespace selector",
                            type: "object",
                            properties: {
                              matchLabels: {
                                description: "The labels to match",
                                type: "object",
                                additionalProperties: {
                                  type: "string",
                                },
                              },
                            },
                          },
                          remotePodSelector: {
                            description: "The remote pod selector",
                            type: "object",
                            properties: {
                              matchLabels: {
                                description: "The labels to match",
                                type: "object",
                                additionalProperties: {
                                  type: "string",
                                },
                              },
                            },
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
