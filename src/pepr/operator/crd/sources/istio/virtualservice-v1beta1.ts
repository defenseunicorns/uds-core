import { V1JSONSchemaProps } from "@kubernetes/client-node";

const matchRequired = [{ required: ["exact"] }, { required: ["prefix"] }, { required: ["regex"] }];
const matchTemplate = {
  oneOf: [
    {
      not: {
        anyOf: matchRequired,
      },
    },
    ...matchRequired,
  ],
  properties: {
    exact: {
      type: "string",
    },
    prefix: {
      type: "string",
    },
    regex: {
      description: "RE2 style regex-based match (https://github.com/google/re2/wiki/Syntax).",
      type: "string",
    },
  },
  type: "object",
};

export const virtualServiceHttpMatch: V1JSONSchemaProps = {
  description:
    "Match the incoming request based on custom rules. Not permitted when using the passthrough gateway.",
  items: {
    properties: {
      ignoreUriCase: {
        description: "Flag to specify whether the URI matching should be case-insensitive.",
        type: "boolean",
      },
      method: matchTemplate,
      name: {
        description: "The name assigned to a match.",
        type: "string",
      },
      queryParams: {
        additionalProperties: matchTemplate,
        description: "Query parameters for matching.",
        type: "object",
      },
      uri: matchTemplate,
    },
    required: ["name"],
    type: "object",
  },
  type: "array",
};
