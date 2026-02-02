/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { V1CustomResourceDefinition, V1CustomResourceDefinitionVersion, V1JSONSchemaProps } from "@kubernetes/client-node";

import { advancedHTTP } from "../istio/virtualservice-v1beta1";

const AuthorizationSchema: V1JSONSchemaProps = {
  description: "Authorization settings.",
  type: "object",
  properties: {
    credentials: {
      description:
        "Selects a key of a Secret in the namespace that contains the credentials for authentication.",
      type: "object",
      properties: {
        key: {
          description: "The key of the secret to select from. Must be a valid secret key.",
          type: "string",
        },
        name: {
          description:
            "Name of the referent. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names",
          type: "string",
        },
        optional: {
          description: "Specify whether the Secret or its key must be defined",
          type: "boolean",
        },
      },
      required: ["key"], // Ensure key is required in the schema
    },
    type: {
      description:
        'Defines the authentication type. The value is case-insensitive. "Basic" is not a supported value. Default: "Bearer"',
      type: "string",
    },
  },
  required: ["credentials"], // Ensure credentials is required in the schema
};

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
        enum: ["KubeAPI", "KubeNodes", "IntraNamespace", "CloudMetadata", "Anywhere"],
      },
      remoteCidr: {
        description: "Custom generated policy CIDR",
        type: "string",
      },
      remoteHost: {
        description: "Remote host to allow traffic out to",
        type: "string",
      },
      remoteProtocol: {
        description: "Protocol used for external connection",
        type: "string",
        enum: ["TLS", "HTTP"],
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
      remoteServiceAccount: {
        description:
          "The remote service account to restrict incoming traffic from within the remote namespace. \
          Only valid for Ingress rules.",
        type: "string",
      },
      serviceAccount: {
        description:
          "The service account to restrict outgoing traffic from within the package namespace. \
          Only valid for Egress rules.",
        type: "string",
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
        type: "string",
        default: "tenant",
      },
      domain: {
        description:
          "The domain to expose the service on, only valid for additional gateways (not tenant, admin, or passthrough)",
        type: "string",
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
          "Selector for Pods targeted by the selected Services (so the NetworkPolicy can be generated correctly).",
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

const serviceMesh = {
  description: "Service Mesh configuration for the package",
  type: "object",
  properties: {
    mode: {
      type: "string",
      enum: ["sidecar", "ambient"],
      default: "ambient",
      description: "Set the service mesh mode for this package (namespace), defaults to ambient",
    },
  },
} as V1JSONSchemaProps;

const monitor = {
  description: "Create Service or Pod Monitor configurations",
  type: "array",
  items: {
    type: "object",
    required: ["portName", "selector", "targetPort"],
    properties: {
      description: {
        type: "string",
        description:
          "A description of this monitor entry, this will become part of the ServiceMonitor name",
      },
      portName: {
        description: "The port name for the serviceMonitor",
        type: "string",
      },
      targetPort: {
        description:
          "The service targetPort. This is required so the NetworkPolicy can be generated correctly.",
        minimum: 1,
        maximum: 65535,
        type: "number",
      },
      selector: {
        description: "Selector for Services that expose metrics to scrape",
        type: "object",
        additionalProperties: {
          type: "string",
        },
      },
      podSelector: {
        description:
          "Selector for Pods targeted by the selected Services (so the NetworkPolicy can be generated correctly). Defaults to `selector` when not specified.",
        type: "object",
        additionalProperties: {
          type: "string",
        },
      },
      path: {
        description: "HTTP path from which to scrape for metrics, defaults to `/metrics`",
        type: "string",
      },
      kind: {
        description:
          "The type of monitor to create; PodMonitor or ServiceMonitor. ServiceMonitor is the default.",
        enum: ["PodMonitor", "ServiceMonitor"],
        type: "string",
      },
      fallbackScrapeProtocol: {
        description:
          "The protocol for Prometheus to use if a scrape returns a blank, unparsable, or otherwise invalid Content-Type",
        // Enum copied from upstream Prometheus supported values
        enum: [
          "OpenMetricsText0.0.1",
          "OpenMetricsText1.0.0",
          "PrometheusProto",
          "PrometheusText0.0.4",
          "PrometheusText1.0.0",
        ],
        type: "string",
      },
      authorization: AuthorizationSchema,
    },
  },
};

const sso = {
  description: "Create SSO client configurations",
  type: "array",
  items: {
    type: "object",
    required: ["clientId", "name"],
    properties: {
      enableAuthserviceSelector: {
        description:
          "Labels to match pods to automatically protect with authservice. Leave empty to disable authservice protection",
        type: "object",
        additionalProperties: {
          type: "string",
        },
      },
      secretConfig: {
        description: "Configuration for the generated Kubernetes Secret",
        type: "object",
        properties: {
          name: {
            description: "The name of the secret to store the client secret",
            type: "string",
          },
          labels: {
            description:
              "Additional labels to apply to the generated secret, can be used for pod reloading",
            type: "object",
            additionalProperties: {
              type: "string",
            },
          },
          annotations: {
            description:
              "Additional annotations to apply to the generated secret, can be used for pod reloading with a selector",
            type: "object",
            additionalProperties: {
              type: "string",
            },
          },
          template: {
            description: "A template for the generated secret",
            type: "object",
            additionalProperties: {
              type: "string",
            },
          },
        },
      },
      clientId: {
        description: "The client identifier registered with the identity provider.",
        type: "string",
      },
      secret: {
        description:
          "The OAuth/OIDC client secret value sent to Keycloak. Typically left blank and auto-generated by Keycloak. Not to be confused with secretConfig, which configures the Kubernetes Secret resource.",
        type: "string",
      },
      // Deprecated fields
      secretName: {
        description: "Deprecated: use secretConfig.name",
        type: "string",
      },
      secretLabels: {
        description: "Deprecated: use secretConfig.labels",
        type: "object",
        additionalProperties: {
          type: "string",
        },
      },
      secretAnnotations: {
        description: "Deprecated: use secretConfig.annotations",
        type: "object",
        additionalProperties: {
          type: "string",
        },
      },
      secretTemplate: {
        description: "Deprecated: use secretConfig.template",
        type: "object",
        additionalProperties: {
          type: "string",
        },
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
      baseUrl: {
        description:
          "Default URL to use when the auth server needs to redirect or link back to the client.",
        type: "string",
      },
      adminUrl: {
        description:
          "This URL will be used for every binding to both the SP's Assertion Consumer and Single Logout Services.",
        type: "string",
      },
      protocol: {
        description: "Specifies the protocol of the client, either 'openid-connect' or 'saml'",
        type: "string",
        enum: ["openid-connect", "saml"],
      },
      attributes: {
        description: "Specifies attributes for the client.",
        type: "object",
        additionalProperties: {
          type: "string",
        },
      },
      protocolMappers: {
        description: "Protocol Mappers to configure on the client",
        type: "array",
        default: [],
        items: {
          type: "object",
          required: ["name", "protocol", "protocolMapper"],
          properties: {
            name: {
              description: "Name of the mapper",
              type: "string",
            },
            protocol: {
              description: "Protocol of the mapper",
              type: "string",
              enum: ["openid-connect", "saml"],
            },
            protocolMapper: {
              description: "Protocol Mapper type of the mapper",
              type: "string",
            },
            consentRequired: {
              description: "Whether user consent is required for this mapper",
              type: "boolean",
              default: false,
            },
            config: {
              description: "Configuration options for the mapper.",
              type: "object",
              additionalProperties: {
                type: "string",
              },
            },
          },
        },
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
      standardFlowEnabled: {
        description:
          "Enables the standard OpenID Connect redirect based authentication with authorization code.",
        type: "boolean",
        default: true,
      },
      serviceAccountsEnabled: {
        description:
          "Enables the client credentials grant based authentication via OpenID Connect protocol.",
        type: "boolean",
        default: false,
      },
      publicClient: {
        description: "Defines whether the client requires a client secret for authentication",
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
      groups: {
        description: "The client SSO group type",
        type: "object",
        properties: {
          anyOf: {
            description: "List of groups allowed to access the client",
            type: "array",
            items: {
              type: "string",
            },
          },
        },
      },
    },
  } as V1JSONSchemaProps,
} as V1JSONSchemaProps;

const caBundle = {
  description: "CA bundle configuration for the package",
  type: "object",
  properties: {
    configMap: {
      description: "ConfigMap configuration for CA bundle",
      type: "object",
      properties: {
        name: {
          description: "The name of the ConfigMap to create (default: uds-trust-bundle)",
          type: "string",
          default: "uds-trust-bundle",
        },
        key: {
          description: "The key name inside the ConfigMap (default: ca-bundle.pem)",
          type: "string",
          default: "ca-bundle.pem",
        },
        labels: {
          description: "Additional labels to apply to the generated ConfigMap (default: {})",
          type: "object",
          additionalProperties: {
            type: "string",
          },
          default: {},
        },
        annotations: {
          description: "Additional annotations to apply to the generated ConfigMap (default: {})",
          type: "object",
          additionalProperties: {
            type: "string",
          },
          default: {},
        },
      },
    },
  },
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
      name: "Monitors",
      type: "string",
      description: "Service monitors for the package",
      jsonPath: ".status.monitors",
    },
    {
      name: "Network Policies",
      type: "integer",
      description: "The number of network policies created by the package",
      jsonPath: ".status.networkPolicyCount",
    },
    {
      name: "Authorization Policies",
      type: "integer",
      description: "The number of authorization policies created by the package",
      jsonPath: ".status.authorizationPolicyCount",
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
            conditions: {
              description: "Status conditions following Kubernetes-style conventions",
              type: "array",
              items: {
                type: "object",
                required: ["type", "status", "lastTransitionTime", "reason", "message"],
                properties: {
                  type: {
                    description:
                      "Type of condition in CamelCase or in foo.example.com/CamelCase format",
                    type: "string",
                  },
                  status: {
                    description: "Status of the condition, one of True, False, Unknown",
                    type: "string",
                    enum: ["True", "False", "Unknown"],
                  },
                  observedGeneration: {
                    description:
                      "Represents the .metadata.generation that the condition was set based upon",
                    type: "integer",
                  },
                  lastTransitionTime: {
                    description:
                      "The last time the condition transitioned from one status to another",
                    type: "string",
                    format: "date-time",
                  },
                  reason: {
                    description:
                      "A programmatic identifier indicating the reason for the condition's last transition",
                    type: "string",
                  },
                  message: {
                    description: "A human-readable message indicating details about the transition",
                    type: "string",
                  },
                },
              },
            },
            phase: {
              enum: ["Pending", "Ready", "Failed", "Retrying", "Removing", "RemovalFailed"],
              type: "string",
            },
            ssoClients: {
              type: "array",
              items: {
                type: "string",
              },
            },
            authserviceClients: {
              type: "array",
              items: {
                type: "object",
                required: ["clientId"],
                properties: {
                  clientId: { type: "string" },
                  selector: {
                    type: "object",
                    additionalProperties: { type: "string" },
                  },
                },
              },
            },
            meshMode: {
              type: "string",
              enum: ["ambient", "sidecar"],
              description: "The current service mesh mode for this package",
            },
            endpoints: {
              type: "array",
              items: {
                type: "string",
              },
            },
            monitors: {
              type: "array",
              items: {
                type: "string",
              },
            },
            networkPolicyCount: {
              type: "integer",
            },
            authorizationPolicyCount: {
              type: "integer",
            },
            retryAttempt: {
              type: "integer",
              nullable: true,
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
                serviceMesh,
              },
            },
            monitor,
            sso,
            caBundle,
          },
        } as V1JSONSchemaProps,
      },
    },
  },
};

export const packageCRD: V1CustomResourceDefinition = {
  apiVersion: "apiextensions.k8s.io/v1",
  kind: "CustomResourceDefinition",
  metadata: { name: "packages.uds.dev" },
  spec: {
    group: "uds.dev",
    scope: "Namespaced",
    names: {
      plural: "packages",
      singular: "package",
      kind: "Package",
      listKind: "PackageList",
      shortNames: ["pkg"],
    },
    versions: [v1alpha1],
  },
};
