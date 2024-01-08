import { describe, expect, it } from "@jest/globals";
import { K8s, kind } from "pepr";

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
            "Unauthorized container securityContext. Containers must not run as root. Authorized: [runAsNonRoot = false | runAsUser > 0]",
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

  it("should restrict capabilities.add", async () => {
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
      // Check for capabilities.add
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
                    add: ["NET_ADMIN"],
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
