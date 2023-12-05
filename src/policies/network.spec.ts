import { describe, expect, it } from "@jest/globals";
import { K8s, kind } from "pepr";

const failIfReached = () => expect(true).toBe(false);

describe("network policies", () => {
  it("should prevent pods from using the host network namespace", async () => {
    const expected = (e: Error) =>
      expect(e).toMatchObject({
        ok: false,
        data: {
          message: expect.stringContaining(
            "Sharing the host namespaces is disallowed. The fields spec.hostNetwork, spec.hostIPC, and spec.hostPID must not be set to true.",
          ),
        },
      });

    const spec = {
      containers: [
        {
          name: "test",
          image: "127.0.0.1/fake",
        },
      ],
    };

    return Promise.all([
      // Check for hostNetwork
      K8s(kind.Pod)
        .Apply({
          metadata: {
            name: "network-host-network",
            namespace: "policy-tests",
          },
          spec: {
            hostNetwork: true,
            ...spec,
          },
        })
        .then(failIfReached)
        .catch(expected),

      // Check for hostIPC
      K8s(kind.Pod)
        .Apply({
          metadata: {
            name: "network-host-ipc",
            namespace: "policy-tests",
          },
          spec: {
            hostIPC: true,
            ...spec,
          },
        })
        .then(failIfReached)
        .catch(expected),

      // Check for hostPID
      K8s(kind.Pod)
        .Apply({
          metadata: {
            name: "network-host-pid",
            namespace: "policy-tests",
          },
          spec: {
            hostPID: true,
            ...spec,
          },
        })
        .then(failIfReached)
        .catch(expected),
    ]);
  });

  it("should prevent pods from using host ports", async () => {
    const expected = (e: Error) =>
      expect(e).toMatchObject({
        ok: false,
        data: {
          message: expect.stringContaining("Host ports are not allowed."),
        },
      });

    return K8s(kind.Pod)
      .Apply({
        metadata: {
          name: "network-host-port",
          namespace: "policy-tests",
        },
        spec: {
          containers: [
            {
              name: "test",
              image: "127.0.0.1/fake",
              ports: [
                {
                  containerPort: 80,
                  hostPort: 8080,
                },
              ],
            },
          ],
        },
      })
      .then(failIfReached)
      .catch(expected);
  });

  it("should prevent ExternalName services", async () => {
    const expected = (e: Error) =>
      expect(e).toMatchObject({
        ok: false,
        data: {
          message: expect.stringContaining("ExternalName services are not allowed."),
        },
      });

    return K8s(kind.Service)
      .Apply({
        metadata: {
          name: "network-external-name",
          namespace: "policy-tests",
        },
        spec: {
          type: "ExternalName",
          externalName: "example.com",
        },
      })
      .then(failIfReached)
      .catch(expected);
  });

  it("should prevent NodePort services", async () => {
    const expected = (e: Error) =>
      expect(e).toMatchObject({
        ok: false,
        data: {
          message: expect.stringContaining("NodePort services are not allowed."),
        },
      });

    return K8s(kind.Service)
      .Apply({
        metadata: {
          name: "network-node-port",
          namespace: "policy-tests",
        },
        spec: {
          type: "NodePort",
          ports: [
            {
              port: 80,
              targetPort: 80,
              nodePort: 30000,
            },
          ],
        },
      })
      .then(failIfReached)
      .catch(expected);
  });
});
