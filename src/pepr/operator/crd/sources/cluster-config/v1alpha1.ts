/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

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
          properties: {
            attributes: {
              type: "object",
              properties: {
                clusterName: {
                  type: "string",
                  description: "Friendly name to associate with your UDS cluster",
                },
                tags: {
                  type: "array",
                  description: "Tags to apply to your UDS cluster",
                  items: {
                    type: "string",
                  },
                },
              },
            },
            networking: {
              type: "object",
              properties: {
                kubeapiCIDR: {
                  type: "string",
                  description:
                    "cidr range for your Kubernetes control plane nodes. This is a manual override that can be used instead of relying on Pepr to automatically watch and update the values",
                },
                kubenodeCIDRS: {
                  type: "array",
                  description:
                    "cidr(s) for all Kubernetes nodes (not just control plane). Similar reason to above,annual override instead of relying on watch",
                  items: {
                    type: "string",
                    pattern:
                      "^(([0-9]{1,3}\\.){3}[0-9]{1,3}\\/[0-9]+)|(([a-fA-F0-9:]+:+)+[a-fA-F0-9:]+(/[0-9]+)?)$", // Matches IPv4 and IPv6 CIDR
                  },
                },
              },
            },
            expose: {
              type: "object",
              properties: {
                domain: {
                  type: "string",
                  description: "Domain all cluster services will be exposed on",
                },
                adminDomain: {
                  type: "string",
                  description:
                    "Domain all cluster services on the admin gateawy will be exposed on",
                },
                caCert: {
                  type: "string",
                  description:
                    "The trusted CA that signed your domain certificates if using Private PKI ",
                },
              },
              required: ["domain"],
            },
            policy: {
              type: "object",
              properties: {
                allowAllNsExemptions: {
                  type: "boolean",
                  description:
                    "Allow UDS Exemption custom resources to live in any namespace (default false)",
                  default: false,
                },
              },
              required: ["allowAllNsExemptions"],
            },
          },
          required: ["expose", "policy"],
        } as V1JSONSchemaProps,
      },
      required: ["spec"],
    },
  },
};
