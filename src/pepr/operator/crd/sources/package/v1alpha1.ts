import { V1CustomResourceDefinitionVersion, V1JSONSchemaProps } from "@kubernetes/client-node";

import { advancedHTTP } from "../istio/virtualservice-v1beta1";

const allow = {
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
      description: {
        type: "string",
        description: "A description of the policy, this will become part of the policy name",
      },
      direction: {
        description: "The direction of the traffic",
        enum: ["Ingress", "Egress"],
        type: "string",
      },
      selector: {
        description:
          "Labels to match pods in the namespace to apply the policy to. Leave empty to apply to all pods in the namespace",
        type: "object",
        additionalProperties: {
          type: "string",
        },
      },
      remoteNamespace: {
        description:
          "The remote namespace to allow traffic to/from. Use * or empty string to allow all namespaces",
        type: "string",
      },
      remoteSelector: {
        description: "The remote pod selector labels to allow traffic to/from",
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
        description: "The port to allow (protocol is always TCP)",
        minimum: 1,
        maximum: 65535,
        type: "number",
      },
      ports: {
        description: "A list of ports to allow (protocol is always TCP)",
        type: "array",
        items: {
          minimum: 1,
          maximum: 65535,
          type: "number",
        },
      },
      // Deprecated fields
      podLabels: {
        description: "Deprecated: use selector",
        type: "object",
        additionalProperties: {
          type: "string",
        },
      },
      remotePodLabels: {
        description: "Deprecated: use remoteSelector",
        type: "object",
        additionalProperties: {
          type: "string",
        },
      },
    },
  } as V1JSONSchemaProps,
} as V1JSONSchemaProps;

const expose = {
  type: "array",
  description: "Expose a service on an Istio Gateway",
  items: {
    type: "object",
    required: ["host"],
    anyOf: [
      {
        required: ["service", "podLabels", "port"],
      },
      {
        required: ["service", "selector", "port"],
      },
      {
        required: ["advancedHTTP"],
      },
    ],
    properties: {
      description: {
        type: "string",
        description:
          "A description of this expose entry, this will become part of the VirtualService name",
      },
      host: {
        description: "The hostname to expose the service on",
        type: "string",
      },
      gateway: {
        description: "The name of the gateway to expose the service on (default: tenant)",
        enum: ["admin", "tenant", "passthrough"],
        type: "string",
        default: "tenant",
      },
      service: {
        description: "The name of the service to expose",
        type: "string",
      },
      port: {
        description: "The port number to expose",
        minimum: 1,
        maximum: 65535,
        type: "number",
      },
      selector: {
        description:
          "Labels to match pods in the namespace to apply the policy to. Leave empty to apply to all pods in the namespace",
        type: "object",
        additionalProperties: {
          type: "string",
        },
      },
      targetPort: {
        description:
          "The service targetPort. This defaults to port and is only required if the service port is different from the target port (so the NetworkPolicy can be generated correctly).",
        minimum: 1,
        maximum: 65535,
        type: "number",
      },
      advancedHTTP,
      // Deprecated field
      match: {
        description: "Deprecated: use advancedHTTP.match",
        ...advancedHTTP.properties?.match,
      },
      podLabels: {
        description: "Deprecated: use selector",
        type: "object",
        additionalProperties: {
          type: "string",
        },
      },
    },
  } as V1JSONSchemaProps,
} as V1JSONSchemaProps;

const sso = {
  description: "Create SSO client configurations",
  type: "array",
  items: {
    type: "object",
    required: ["clientId", "name", "redirectUris"],
    properties: {
      isAuthSvcClient: {
        description: "If true, the client will generate a new Auth Service client as well",
        type: "boolean",
        default: false,
      },
      secretName: {
        description: "The name of the secret to store the client secret",
        type: "string",
      },
      secretTemplate: {
        description: "A template for the generated secret",
        // Create a map of the secret data
        type: "object",
        additionalProperties: {
          type: "string",
        },
      },
      clientId: {
        description: "The client identifier registered with the identity provider.",
        type: "string",
      },
      secret: {
        description: "The client secret. Typically left blank and auto-generated.",
        type: "string",
      },
      name: {
        description: "Specifies display name of the client",
        type: "string",
      },
      description: {
        description:
          "A description for the client, can be a URL to an image to replace the login logo",
        type: "string",
      },
      rootUrl: {
        description: "Root URL appended to relative URLs",
        type: "string",
      },
      redirectUris: {
        description:
          "Valid URI pattern a browser can redirect to after a successful login. Simple wildcards are allowed such as 'https://unicorns.uds.dev/*'",
        type: "array",
        items: {
          type: "string",
        },
        minItems: 1,
      },
      webOrigins: {
        description:
          "Allowed CORS origins. To permit all origins of Valid Redirect URIs, add '+'. This does not include the '*' wildcard though. To permit all origins, explicitly add '*'.",
        type: "array",
        items: {
          type: "string",
        },
      },
      enabled: {
        description: "Whether the SSO client is enabled",
        type: "boolean",
        default: true,
      },
      alwaysDisplayInConsole: {
        description:
          "Always list this client in the Account UI, even if the user does not have an active session.",
        type: "boolean",
        default: false,
      },
      clientAuthenticatorType: {
        description: "The client authenticator type",
        type: "string",
        enum: ["client-secret", "client-jwt"],
      },
      defaultClientScopes: {
        description: "Default client scopes",
        type: "array",
        items: {
          type: "string",
        },
      },
    },
  } as V1JSONSchemaProps,
} as V1JSONSchemaProps;

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
      name: "SSO Clients",
      type: "string",
      description: "SSO Clients created by the package",
      jsonPath: ".status.ssoClients",
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
            ssoClients: {
              type: "array",
              items: {
                type: "string",
              },
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
        } as V1JSONSchemaProps,
        spec: {
          type: "object",
          properties: {
            network: {
              type: "object",
              description: "Network configuration for the package",
              properties: {
                expose,
                allow,
              },
            },
            sso,
          },
        } as V1JSONSchemaProps,
      },
    },
  },
};
