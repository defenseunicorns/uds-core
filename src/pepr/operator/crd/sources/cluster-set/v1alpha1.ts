/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { V1CustomResourceDefinitionVersion, V1JSONSchemaProps } from "@kubernetes/client-node";

export const v1alpha1: V1CustomResourceDefinitionVersion = {
  name: "v1alpha1",
  served: true,
  storage: true,
  additionalPrinterColumns: [
    {
      name: "Provider",
      type: "string",
      description: "The multicluster backend provider",
      jsonPath: ".spec.provider",
    },
    {
      name: "Status",
      type: "string",
      description: "The status of the cluster set",
      jsonPath: ".status.phase",
    },
    {
      name: "Age",
      type: "date",
      description: "The age of the cluster set",
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
        spec: {
          type: "object",
          required: ["clusters"],
          properties: {
            provider: {
              type: "string",
              description: "The multicluster backend provider",
              enum: ["submariner"],
              default: "submariner",
            },
            clusters: {
              type: "array",
              description: "Member clusters in this set",
              items: {
                type: "object",
                required: ["name"],
                properties: {
                  name: {
                    type: "string",
                    description: "Name of the member cluster",
                  },
                },
              },
            },
          },
        } as V1JSONSchemaProps,
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
            clusters: {
              type: "array",
              description: "Per-cluster status (populated by status aggregation)",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  status: { type: "string" },
                  services: { type: "integer" },
                },
              },
            },
          },
        } as V1JSONSchemaProps,
      },
      required: ["spec"],
    },
  },
};
