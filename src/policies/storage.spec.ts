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

  it("should restrict volume types to the allowed list", async () => {
    const expected = (e: Error) =>
      expect(e).toMatchObject({
        ok: false,
        data: {
          message: expect.stringContaining(
            "Volume host-vol has a disallowed volume type of 'hostPath'.",
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
              volumeMounts: [
                {
                  name: "host-vol",
                  mountPath: "/host-data",
                },
              ],
            },
          ],
          volumes: [
            {
              name: "host-vol",
              hostPath: {
                path: "/data",
                type: "DirectoryOrCreate",
              },
            },
          ],
        },
      })
      .catch(expected);
  });

  it("should restrict hostPath volumes to read-only", async () => {
    const expected = (e: Error) =>
      expect(e).toMatchObject({
        ok: false,
        data: {
          message: expect.stringContaining(
            "hostPath volume 'host-vol' must be mounted as readOnly.",
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
              volumeMounts: [
                {
                  name: "host-vol",
                  mountPath: "/host-data",
                  readOnly: false,
                },
              ],
            },
          ],
          volumes: [
            {
              name: "host-vol",
              hostPath: {
                path: "/data",
                type: "DirectoryOrCreate",
              },
            },
          ],
        },
      })
      .catch(expected);
  });
});
