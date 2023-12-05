import { describe, expect, it } from "@jest/globals";
import { K8s, kind } from "pepr";

const failIfReached = () => expect(true).toBe(false);

describe("storage policies", () => {
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
          name: "storage-volume-type",
          namespace: "policy-tests",
        },
        spec: {
          containers: [
            {
              name: "test",
              image: "127.0.0.1/fake",
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
      .then(failIfReached)
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
          name: "storage-restrict-hostpath",
          namespace: "policy-tests",
        },
        spec: {
          containers: [
            {
              name: "test",
              image: "127.0.0.1/fake",
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
      .then(failIfReached)
      .catch(expected);
  });
});
