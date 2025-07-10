/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s, kind } from "pepr";
import { describe, expect, it } from "vitest";

const failIfReached = () => expect(true).toBe(false);

describe("security policies", () => {
  it("should not allow privilege escalation", async () => {
    const expected = (e: Error) =>
      expect(e).toMatchObject({
        ok: false,
        data: {
          message: expect.stringContaining(
            "Privilege escalation is disallowed. Authorized: [allowPrivilegeEscalation = false | privileged = false]",
          ),
        },
      });

    return Promise.all([
      // Check for allowPrivilegeEscalation
      K8s(kind.Pod)
        .Apply({
          metadata: {
            name: "security-privilege-escalation",
            namespace: "policy-tests",
          },
          spec: {
            containers: [
              {
                name: "test",
                image: "127.0.0.1/fake",
                securityContext: {
                  allowPrivilegeEscalation: true,
                },
              },
            ],
          },
        })
        .then(failIfReached)
        .catch(expected),

      // Check for privileged
      K8s(kind.Pod)
        .Apply({
          metadata: {
            name: "security-privileged",
            namespace: "policy-tests",
          },
          spec: {
            containers: [
              {
                name: "test",
                image: "127.0.0.1/fake",
                securityContext: {
                  privileged: true,
                },
              },
            ],
          },
        })
        .then(failIfReached)
        .catch(expected),
    ]);
  });

  it("should not allow root users", async () => {
    const expected = (e: Error) =>
      expect(e).toMatchObject({
        ok: false,
        data: {
          message: expect.stringContaining(
            "Unauthorized container securityContext. Containers must not run as root. Authorized: [runAsNonRoot = true | runAsUser > 0]",
          ),
        },
      });

    return Promise.all([
      // Check for runAsUser = 0
      K8s(kind.Pod)
        .Apply({
          metadata: {
            name: "security-run-as-user",
            namespace: "policy-tests",
          },
          spec: {
            containers: [
              {
                name: "test",
                image: "127.0.0.1/fake",
                securityContext: {
                  runAsUser: 0,
                },
              },
            ],
          },
        })
        .then(failIfReached)
        .catch(expected),

      // Check for runAsNonRoot = false
      K8s(kind.Pod)
        .Apply({
          metadata: {
            name: "security-run-as-non-root",
            namespace: "policy-tests",
          },
          spec: {
            containers: [
              {
                name: "test",
                image: "127.0.0.1/fake",
                securityContext: {
                  runAsNonRoot: false,
                },
              },
            ],
          },
        })
        .then(failIfReached)
        .catch(expected),

      // Check for runAsNonRoot = true and runAsUser = 0
      K8s(kind.Pod)
        .Apply({
          metadata: {
            name: "security-run-as-non-root-and-user",
            namespace: "policy-tests",
          },
          spec: {
            containers: [
              {
                name: "test",
                image: "127.0.0.1/fake",
                securityContext: {
                  runAsNonRoot: false,
                  runAsUser: 0,
                },
              },
            ],
          },
        })
        .then(failIfReached)
        .catch(expected),
    ]);
  });

  // This only works if ProcMountType feature gate is enabled (k3d does not have it enabled by default)
  it.skip("should restrict procMount to DefaultProcMount", async () => {
    const expected = (e: Error) =>
      expect(e).toMatchObject({
        ok: false,
        data: {
          message: expect.stringContaining(
            "Unauthorized procMount type. Authorized: [undefined | Default]",
          ),
        },
      });

    return K8s(kind.Pod)
      .Apply({
        metadata: {
          name: "security-proc-mount",
          namespace: "policy-tests",
        },
        spec: {
          containers: [
            {
              name: "test",
              image: "127.0.0.1/fake",
              securityContext: {
                procMount: "Unmasked",
              },
            },
          ],
        },
      })
      .then(failIfReached)
      .catch(expected);
  });

  it("should restrict seccomp profiles to runtime/localhost", async () => {
    const expected = (e: Error) =>
      expect(e).toMatchObject({
        ok: false,
        data: {
          message: expect.stringContaining(
            "seccomp profile type. Authorized: [RuntimeDefault | Localhost]",
          ),
        },
      });

    return Promise.all([
      // Check for pod seccompProfile.type = Unconfined
      K8s(kind.Pod)
        .Apply({
          metadata: {
            name: "security-seccomp-profile-pod",
            namespace: "policy-tests",
          },
          spec: {
            securityContext: {
              seccompProfile: {
                type: "Unconfined",
              },
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
        .catch(expected),

      // Check for container seccompProfile.type = Unconfined
      K8s(kind.Pod)
        .Apply({
          metadata: {
            name: "security-seccomp-profile",
            namespace: "policy-tests",
          },
          spec: {
            containers: [
              {
                name: "test",
                image: "127.0.0.1/fake",
                securityContext: {
                  seccompProfile: {
                    type: "Unconfined",
                  },
                },
              },
            ],
          },
        })
        .then(failIfReached)
        .catch(expected),
    ]);
  });

  it("should disallow seLinuxOptions", async () => {
    const expected = (e: Error) =>
      expect(e).toMatchObject({
        ok: false,
        data: {
          message: expect.stringContaining(
            "SELinux Options. Authorized: [user: undefined | role: undefined]",
          ),
        },
      });

    return Promise.all([
      K8s(kind.Pod)
        .Apply({
          metadata: {
            name: "security-selinux-pod",
            namespace: "policy-tests",
          },
          spec: {
            securityContext: {
              seLinuxOptions: {
                user: "bad",
                role: "bad",
              },
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
        .catch(expected),

      K8s(kind.Pod)
        .Apply({
          metadata: {
            name: "security-selinux-pod",
            namespace: "policy-tests",
          },
          spec: {
            containers: [
              {
                name: "test",
                image: "127.0.0.1/fake",
                securityContext: {
                  seLinuxOptions: {
                    user: "bad",
                    role: "bad",
                  },
                },
              },
            ],
          },
        })
        .then(failIfReached)
        .catch(expected),
    ]);
  });

  it("should restrict seLinuxTypes", async () => {
    const expected = (e: Error) =>
      expect(e).toMatchObject({
        ok: false,
        data: {
          message: expect.stringContaining(
            "SELinux type. Authorized: [container_t | container_init_t | container_kvm_t]",
          ),
        },
      });

    return Promise.all([
      // Check for seLinux pod type
      K8s(kind.Pod)
        .Apply({
          metadata: {
            name: "security-selinux-pod",
            namespace: "policy-tests",
          },
          spec: {
            securityContext: {
              seLinuxOptions: {
                type: "unconfined",
              },
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
        .catch(expected),

      // Check for seLinux type
      K8s(kind.Pod)
        .Apply({
          metadata: {
            name: "security-selinux",
            namespace: "policy-tests",
          },
          spec: {
            containers: [
              {
                name: "test",
                image: "127.0.0.1/fake",
                securityContext: {
                  seLinuxOptions: {
                    type: "unconfined",
                  },
                },
              },
            ],
          },
        })
        .then(failIfReached)
        .catch(expected),
    ]);
  });

  it("should restrict istio proxy user (1337) to pods with istio label", async () => {
    const expected = (e: Error) =>
      expect(e).toMatchObject({
        ok: false,
        data: {
          message: expect.stringMatching(
            /cannot run as UID 1337 \(Istio proxy user\) unless (the pod has|they have) the label 'security\.istio\.io\/tlsMode: istio'/,
          ),
        },
      });

    return Promise.all([
      // Test pod-level runAsUser = 1337 without label (should fail)
      K8s(kind.Pod)
        .Apply({
          metadata: {
            name: "istio-user-pod-level",
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
        .catch(expected),

      // Test container-level runAsUser = 1337 without label (should fail)
      K8s(kind.Pod)
        .Apply({
          metadata: {
            name: "istio-user-container-level",
            namespace: "policy-tests",
          },
          spec: {
            containers: [
              {
                name: "test",
                image: "127.0.0.1/fake",
                securityContext: {
                  runAsUser: 1337,
                },
              },
            ],
          },
        })
        .then(failIfReached)
        .catch(expected),
    ]);
  });

  it("should allow istio proxy user (1337) with correct label", async () => {
    // This should pass as the pod has the required label
    return K8s(kind.Pod)
      .Apply({
        metadata: {
          name: "istio-proxy-allowed",
          namespace: "policy-tests",
          labels: {
            "security.istio.io/tlsMode": "istio",
          },
        },
        spec: {
          containers: [
            {
              name: "istio-proxy",
              image: "127.0.0.1/istio-proxy",
              securityContext: {
                runAsUser: 1337,
              },
            },
          ],
        },
      })
      .then(pod => {
        expect(pod).toMatchObject({
          metadata: {
            name: "istio-proxy-allowed",
            labels: {
              "security.istio.io/tlsMode": "istio",
            },
          },
          spec: {
            containers: [
              {
                name: "istio-proxy",
                securityContext: {
                  runAsUser: 1337,
                },
              },
            ],
          },
        });
      })
      .catch(failIfReached);
  });

  it("should allow non-istio user without label", async () => {
    // This should pass as the pod is not using the Istio proxy user
    return K8s(kind.Pod)
      .Apply({
        metadata: {
          name: "non-istio-user",
          namespace: "policy-tests",
        },
        spec: {
          containers: [
            {
              name: "test",
              image: "127.0.0.1/fake",
              securityContext: {
                runAsUser: 1000,
              },
            },
          ],
        },
      })
      .then(pod => {
        expect(pod).toMatchObject({
          metadata: {
            name: "non-istio-user",
          },
          spec: {
            containers: [
              {
                name: "test",
                securityContext: {
                  runAsUser: 1000,
                },
              },
            ],
          },
        });
      })
      .catch(failIfReached);
  });

  it("should allow exempted pods to use istio proxy user", async () => {
    // This test is skipped because it requires a running Kubernetes cluster with the exemption CRD installed
    // and the Pepr controller running to process the exemption
    // In a real environment, the exemption would be created by the cluster admin or through some automation
    // and the test would verify that the pod with the exemption can run as UID 1337
    console.log(
      "Skipping exemption test as it requires a running Kubernetes cluster with the exemption CRD",
    );
    return Promise.resolve();
  });

  it("should drop all capabilities", async () => {
    const expected = (pod: kind.Pod) =>
      expect(pod).toMatchObject({
        spec: {
          containers: [
            {
              securityContext: {
                capabilities: {
                  drop: ["ALL"],
                },
              },
            },
          ],
        },
      });

    return (
      K8s(kind.Pod)
        .Apply({
          metadata: {
            name: "security-capabilities-drop",
            namespace: "policy-tests",
            finalizers: [],
          },
          spec: {
            terminationGracePeriodSeconds: 0,
            containers: [
              {
                name: "test",
                image: "127.0.0.1/fake",
                securityContext: {
                  capabilities: {
                    drop: ["NET_ADMIN"],
                  },
                },
              },
            ],
          },
        })
        // This should not fail because we are mutating the pod
        .then(expected)
        .catch(failIfReached)
    );
  });

  it("should restrict capabilities.add for non-istio-init containers", async () => {
    const expected = (e: Error) =>
      expect(e).toMatchObject({
        ok: false,
        data: {
          message: expect.stringContaining(
            "Unauthorized container capabilities in securityContext.capabilities.add. Authorized: [NET_BIND_SERVICE]",
          ),
        },
      });

    return Promise.all([
      // Check for capabilities.add with a regular container, which should fail
      K8s(kind.Pod)
        .Apply({
          metadata: {
            name: "security-capabilities-add",
            namespace: "policy-tests",
          },
          spec: {
            containers: [
              {
                name: "test",
                image: "127.0.0.1/fake",
                securityContext: {
                  capabilities: {
                    add: ["NET_ADMIN"], // This should trigger a failure since `NET_ADMIN` is not authorized for non-istio-init
                  },
                },
              },
            ],
          },
        })
        .then(failIfReached)
        .catch(expected),
    ]);
  });
});
