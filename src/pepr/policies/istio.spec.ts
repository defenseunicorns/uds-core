/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s, kind } from "pepr";
import { describe, expect, it } from "vitest";
import { IstioAuthorizationPolicy, IstioAction } from "../operator/crd";

const failIfReached = () => expect(true).toBe(false);

describe("restrict istio sidecar configuration overrides", () => {
  it("should prevent single dangerous istio sidecar configuration annotation", async () => {
    const expected = (e: Error) =>
      expect(e).toMatchObject({
        ok: false,
        data: {
          message: expect.stringContaining(
            "The following istio annotations can modify secure sidecar configuration and are not allowed: sidecar.istio.io/proxyImage",
          ),
        },
      });

    return K8s(kind.Pod)
      .Apply({
        metadata: {
          name: "istio-bad-annotation",
          namespace: "policy-tests",
          annotations: {
            "sidecar.istio.io/proxyImage": "malicious/image:latest",
          },
        },
        spec: {
          containers: [
            {
              name: "test",
              image: "127.0.0.1/fake",
            },
          ],
        },
      })
      .then(failIfReached)
      .catch(expected);
  });

  it("should prevent multiple dangerous istio sidecard configuration annotations", async () => {
    const blockedAnnotations = [
      "inject.istio.io/templates",
      "proxy.istio.io/config",
      "sidecar.istio.io/bootstrapOverride",
      "sidecar.istio.io/discoveryAddress",
      "sidecar.istio.io/proxyImage",
      "sidecar.istio.io/userVolume",
    ].sort(); // ensure consistent order for tests

    const expected = (e: Error) =>
      expect(e).toMatchObject({
        ok: false,
        data: {
          message: expect.stringContaining(
            `The following istio annotations can modify secure sidecar configuration and are not allowed: ${blockedAnnotations.join(", ")}`,
          ),
        },
      });

    return K8s(kind.Pod)
      .Apply({
        metadata: {
          name: "istio-multiple-bad-annotations",
          namespace: "policy-tests",
          annotations: Object.fromEntries(
            blockedAnnotations.map(annotation => [annotation, "true"]),
          ),
        },
        spec: {
          containers: [
            {
              name: "test",
              image: "127.0.0.1/fake",
            },
          ],
        },
      })
      .then(failIfReached)
      .catch(expected);
  });
});

describe("restrict istio traffic interception overrides", () => {
  it("should prevent single dangerous traffic interception annotation", async () => {
    const expected = (e: Error) =>
      expect(e).toMatchObject({
        ok: false,
        data: {
          message: expect.stringContaining(
            "The following istio annotations can modify secure traffic interception are not allowed: traffic.sidecar.istio.io/excludeOutboundPorts",
          ),
        },
      });

    return K8s(kind.Pod)
      .Apply({
        metadata: {
          name: "istio-traffic-override",
          namespace: "policy-tests",
          annotations: {
            "traffic.sidecar.istio.io/excludeOutboundPorts": "443,8443",
          },
        },
        spec: {
          containers: [
            {
              name: "test",
              image: "127.0.0.1/fake",
            },
          ],
        },
      })
      .then(failIfReached)
      .catch(expected);
  });

  it("should prevent multiple dangerous traffic interception annotations", async () => {
    const blockedAnnotations = [
      "sidecar.istio.io/interceptionMode",
      "traffic.sidecar.istio.io/excludeInboundPorts",
      "traffic.sidecar.istio.io/excludeOutboundIPRanges",
    ].sort(); // ensure consistent order for tests

    const expected = (e: Error) =>
      expect(e).toMatchObject({
        ok: false,
        data: {
          message: expect.stringContaining(
            `The following istio annotations can modify secure traffic interception are not allowed: ${blockedAnnotations.join(", ")}`,
          ),
        },
      });

    return K8s(kind.Pod)
      .Apply({
        metadata: {
          name: "istio-multiple-traffic-overrides",
          namespace: "policy-tests",
          annotations: Object.fromEntries(
            blockedAnnotations.map(annotation => [annotation, "true"]),
          ),
        },
        spec: {
          containers: [
            {
              name: "test",
              image: "127.0.0.1/fake",
            },
          ],
        },
      })
      .then(failIfReached)
      .catch(expected);
  });
});

describe("restrict istio ambient overrides", () => {
  it("should prevent ambient override annotation", async () => {
    const expected = (e: Error) =>
      expect(e).toMatchObject({
        ok: false,
        data: {
          message: expect.stringContaining(
            "The following istio ambient annotations that can modify secure mesh behavior are not allowed: ambient.istio.io/bypass-inbound-capture",
          ),
        },
      });

    return K8s(kind.Pod)
      .Apply({
        metadata: {
          name: "istio-ambient-override",
          namespace: "policy-tests",
          annotations: {
            "ambient.istio.io/bypass-inbound-capture": "true",
          },
        },
        spec: {
          containers: [
            {
              name: "test",
              image: "127.0.0.1/fake",
            },
          ],
        },
      })
      .then(failIfReached)
      .catch(expected);
  });
});

describe("restrict istio authorization policy overrides", () => {
  it("should prevent dry-run annotation on AuthorizationPolicy", async () => {
    const expected = (e: Error) =>
      expect(e).toMatchObject({
        ok: false,
        data: {
          message: expect.stringContaining(
            "The 'istio.io/dry-run' annotation is not allowed on AuthorizationPolicies because it can lead to unintended policy bypass.",
          ),
        },
      });

    return K8s(IstioAuthorizationPolicy)
      .Apply({
        metadata: {
          name: "istio-auth-policy-with-dry-run",
          namespace: "policy-tests",
          annotations: {
            "istio.io/dry-run": "true",
          },
        },
        spec: {
          action: IstioAction.Deny,
          rules: [
            {
              from: [
                {
                  source: {
                    principals: ["cluster.local/ns/default/sa/default"],
                  },
                },
              ],
            },
          ],
        },
      })
      .then(failIfReached)
      .catch(expected);
  });
});
