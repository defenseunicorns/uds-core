/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s, kind } from "pepr";
import { describe, expect, it } from "vitest";

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

  it("should prevent multiple dangerous istio sidecar configuration annotations", async () => {
    const blockedAnnotations = [
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

  describe("restrict istio traffic interception overrides", () => {
    it("should prevent single dangerous traffic interception annotation", async () => {
      const expected = (e: Error) =>
        expect(e).toMatchObject({
          ok: false,
          data: {
            message: expect.stringContaining(
              "The following istio annotations or labels can modify secure traffic interception are not allowed: annotation traffic.sidecar.istio.io/excludeOutboundPorts",
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
              `The following istio annotations or labels can modify secure traffic interception are not allowed: annotation ${blockedAnnotations.join(", annotation ")}`,
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

    it("should prevent redirect virtual interfaces annotation", async () => {
      const expected = (e: Error) =>
        expect(e).toMatchObject({
          ok: false,
          data: {
            message: expect.stringContaining(
              "The following istio annotations or labels can modify secure traffic interception are not allowed: annotation istio.io/redirect-virtual-interfaces",
            ),
          },
        });

      return K8s(kind.Pod)
        .Apply({
          metadata: {
            name: "istio-redirect-virtual-interfaces",
            namespace: "policy-tests",
            annotations: {
              "istio.io/redirect-virtual-interfaces": "eth0,eth1",
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

      describe("istio proxy user/group restrictions", () => {
        interface K8sError extends Error {
          data?: {
            message?: string;
          };
          ok: boolean;
        }

        const expectIstioUserDenied = (e: unknown) => {
          const error = e as K8sError;
          const message = error.data?.message || error.message || "";
          expect(message).toMatch(/use UID\/GID 1337 \(Istio proxy\)/);
          return expect(error).toMatchObject({ ok: false });
        };

        it("should deny pod with runAsUser 1337", async () => {
          return K8s(kind.Pod)
            .Apply({
              metadata: {
                name: "istio-user-pod",
                namespace: "policy-tests",
              },
              spec: {
                securityContext: {
                  runAsUser: 1337,
                },
                containers: [
                  {
                    name: "test",
                    image: "127.0.0.1/fake",
                  },
                ],
              },
            })
            .then(failIfReached)
            .catch(expectIstioUserDenied);
        });

        it("should deny pod with runAsGroup 1337", async () => {
          return K8s(kind.Pod)
            .Apply({
              metadata: {
                name: "istio-group-pod",
                namespace: "policy-tests",
              },
              spec: {
                securityContext: {
                  runAsGroup: 1337,
                },
                containers: [
                  {
                    name: "test",
                    image: "127.0.0.1/fake",
                  },
                ],
              },
            })
            .then(failIfReached)
            .catch(expectIstioUserDenied);
        });

        it("should deny non-istio container with UID 1337", async () => {
          return K8s(kind.Pod)
            .Apply({
              metadata: {
                name: "bad-container",
                namespace: "policy-tests",
              },
              spec: {
                containers: [
                  {
                    name: "bad-container",
                    image: "127.0.0.1/malicious",
                    securityContext: {
                      runAsUser: 1337,
                    },
                  },
                ],
              },
            })
            .then(failIfReached)
            .catch(expectIstioUserDenied);
        });

        it("should allow ztunnel pod with UID/GID 1337", async () => {
          return K8s(kind.Pod)
            .Apply({
              metadata: {
                name: "ztunnel-test",
                namespace: "istio-system",
                labels: {
                  app: "ztunnel",
                  "app.kubernetes.io/name": "ztunnel",
                  "app.kubernetes.io/part-of": "istio",
                },
              },
              spec: {
                securityContext: {
                  runAsUser: 1337,
                  runAsGroup: 1337,
                },
                containers: [
                  {
                    name: "ztunnel",
                    image: "127.0.0.1/ztunnel",
                  },
                ],
              },
            })
            .then(pod => {
              expect(pod).toMatchObject({
                metadata: {
                  name: "ztunnel-test",
                  namespace: "istio-system",
                },
              });
            });
        });

        it("should allow istio-proxy container with UID/GID 1337", async () => {
          return K8s(kind.Pod)
            .Apply({
              metadata: {
                name: "istio-sidecar",
                namespace: "policy-tests",
                labels: {
                  "istio-prometheus-ignore": "yes",
                },
              },
              spec: {
                containers: [
                  {
                    name: "app",
                    image: "127.0.0.1/app",
                    securityContext: {
                      runAsUser: 1000,
                    },
                  },
                  {
                    name: "istio-proxy",
                    // Using upstream istio proxy image format for testing
                    image: "docker.io/istio/proxyv2:1.0.0",
                    ports: [
                      {
                        name: "http-envoy-prom",
                        containerPort: 15090,
                        protocol: "TCP",
                      },
                    ],
                    args: ["proxy", "sidecar"],
                    securityContext: {
                      runAsUser: 1337,
                      runAsGroup: 1337,
                    },
                  },
                ],
              },
            })
            .then(pod => {
              expect(pod).toMatchObject({
                metadata: {
                  name: "istio-sidecar",
                },
              });
            });
        });
      });
    });
  });
});
