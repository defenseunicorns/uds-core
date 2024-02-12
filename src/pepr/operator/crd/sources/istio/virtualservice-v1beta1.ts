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

export const advancedHTTP: V1JSONSchemaProps = {
  description: "Advanced HTTP settings for the route.",
  properties: {
    corsPolicy: {
      description: "Cross-Origin Resource Sharing policy (CORS).",
      properties: {
        allowCredentials: {
          description:
            "Indicates whether the caller is allowed to send the actual request (not the preflight) using credentials.",
          nullable: true,
          type: "boolean",
        },
        allowHeaders: {
          description: "List of HTTP headers that can be used when requesting the resource.",
          items: {
            type: "string",
          },
          type: "array",
        },
        allowMethods: {
          description: "List of HTTP methods allowed to access the resource.",
          items: {
            type: "string",
          },
          type: "array",
        },
        allowOrigin: {
          items: {
            type: "string",
          },
          type: "array",
        },
        allowOrigins: {
          description: "String patterns that match allowed origins.",
          items: matchTemplate,
          type: "array",
        },
        exposeHeaders: {
          description: "A list of HTTP headers that the browsers are allowed to access.",
          items: {
            type: "string",
          },
          type: "array",
        },
        maxAge: {
          description: "Specifies how long the results of a preflight request can be cached.",
          type: "string",
        },
      },
      type: "object",
    },
    directResponse: {
      description:
        "A HTTP rule can either return a direct_response, redirect or forward (default) traffic.",
      properties: {
        body: {
          description: "Specifies the content of the response body.",
          oneOf: [
            {
              not: {
                anyOf: [
                  {
                    required: ["string"],
                  },
                  {
                    required: ["bytes"],
                  },
                ],
              },
            },
            {
              required: ["string"],
            },
            {
              required: ["bytes"],
            },
          ],
          properties: {
            bytes: {
              description: "response body as base64 encoded bytes.",
              format: "binary",
              type: "string",
            },
            string: {
              type: "string",
            },
          },
          type: "object",
        },
        status: {
          description: "Specifies the HTTP response status to be returned.",
          type: "integer",
        },
      },
      required: ["status"],
      type: "object",
    },
    headers: {
      properties: {
        request: {
          properties: {
            add: {
              additionalProperties: {
                type: "string",
              },
              type: "object",
            },
            remove: {
              items: {
                type: "string",
              },
              type: "array",
            },
            set: {
              additionalProperties: {
                type: "string",
              },
              type: "object",
            },
          },
          type: "object",
        },
        response: {
          properties: {
            add: {
              additionalProperties: {
                type: "string",
              },
              type: "object",
            },
            remove: {
              items: {
                type: "string",
              },
              type: "array",
            },
            set: {
              additionalProperties: {
                type: "string",
              },
              type: "object",
            },
          },
          type: "object",
        },
      },
      type: "object",
    },
    match: {
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
    },
    rewrite: {
      description: "Rewrite HTTP URIs and Authority headers.",
      properties: {
        authority: {
          description: "rewrite the Authority/Host header with this value.",
          type: "string",
        },
        uri: {
          description: "rewrite the path (or the prefix) portion of the URI with this value.",
          type: "string",
        },
        uriRegexRewrite: {
          description: "rewrite the path portion of the URI with the specified regex.",
          properties: {
            match: {
              description:
                "RE2 style regex-based match (https://github.com/google/re2/wiki/Syntax).",
              type: "string",
            },
            rewrite: {
              description: "The string that should replace into matching portions of original URI.",
              type: "string",
            },
          },
          type: "object",
        },
      },
      type: "object",
    },
    retries: {
      description: "Retry policy for HTTP requests.",
      properties: {
        attempts: {
          description: "Number of retries to be allowed for a given request.",
          format: "int32",
          type: "integer",
        },
        perTryTimeout: {
          description:
            "Timeout per attempt for a given request, including the initial call and any retries.",
          type: "string",
        },
        retryOn: {
          description: "Specifies the conditions under which retry takes place.",
          type: "string",
        },
        retryRemoteLocalities: {
          description: "Flag to specify whether the retries should retry to other localities.",
          nullable: true,
          type: "boolean",
        },
      },
      type: "object",
    },
    weight: {
      description:
        "Weight specifies the relative proportion of traffic to be forwarded to the destination.",
      format: "int32",
      type: "integer",
    },
    timeout: {
      description: "Timeout for HTTP requests, default is disabled.",
      type: "string",
    },
  },
  type: "object",
};
