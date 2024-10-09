// SPDX-License-Identifier: AGPL-3.0-or-later OR Commercial
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
          required: ["exemptions"],
          properties: {
            exemptions: {
              type: "array",
              minItems: 1,
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
