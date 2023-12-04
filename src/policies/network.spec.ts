import { beforeAll, describe, expect, it } from "@jest/globals";
import { K8s, kind } from "pepr";

describe("storage policies", () => {
  beforeAll(async () => {
    // Ensure the policy-tests namespace exists
    await K8s(kind.Namespace).Apply({
      metadata: {
        name: "policy-tests",
        labels: {
          "istio-injection": "disabled",
          "zarf.dev/agent": "ignore",
        },
      },
    });
  });

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

    const metadata = {
      name: "httpbin",
      namespace: "policy-tests",
    };

    const spec = {
      containers: [
        {
          name: "httpbin",
          image: "kennethreitz/httpbin",
        },
      ],
    };

    return Promise.all([
      // Check for hostNetwork
      K8s(kind.Pod)
        .Apply({
          metadata,
          spec: {
            hostNetwork: true,
            ...spec,
          },
        })
        .catch(expected),
      // Check for hostIPC
      K8s(kind.Pod)
        .Apply({
          metadata,
          spec: {
            hostIPC: true,
            ...spec,
          },
        })
        .catch(expected),
      // Check for hostPID
      K8s(kind.Pod)
        .Apply({
          metadata,
          spec: {
            hostPID: true,
            ...spec,
          },
        })
        .catch(expected),
    ]);
  });

  it("should prevent pods from using host ports", async () => {
    const expected = (e: Error) =>
      expect(e).toMatchObject({
        ok: false,
        data: {
          message: expect.stringContaining(
            "Host ports are not allowed. Only exempted resources are allowed to use host ports.",
          ),
        },
      });

    return K8s(kind.Pod)
      .Apply({
        metadata: {
          name: "httpbin",
          namespace: "policy-tests",
        },
        spec: {
          containers: [
            {
              name: "httpbin",
              image: "kennethreitz/httpbin",
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
      .catch(expected);
  });
});
