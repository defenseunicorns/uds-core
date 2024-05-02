import { describe, expect, it } from "@jest/globals";
import { generateServiceMonitor } from "./service-monitor";

describe("test generate service monitor", () => {
  it("should return a valid Service Monitor object", () => {
    const pkg = {
      apiVersion: "uds.dev/v1alpha1",
      kind: "Package",
      metadata: {
        name: "test",
        uid: "f50120aa-2713-4502-9496-566b102b1174",
      },
    };
    const portName = "http-metrics";
    const metricsPath = "/test";
    const selectorApp = "test";
    const monitor = {
      portName: portName,
      path: metricsPath,
      targetPort: 1234,
      selector: {
        app: selectorApp,
      },
    };
    const namespace = "test";
    const pkgName = "test";
    const generation = "1";
    const payload = generateServiceMonitor(pkg, monitor, namespace, pkgName, generation);

    expect(payload).toBeDefined();
    expect(payload.metadata?.name).toEqual(`${pkgName}-${selectorApp}-${portName}`);
    expect(payload.metadata?.namespace).toEqual(namespace);
    expect(payload.spec?.endpoints).toBeDefined();
    if (payload.spec?.endpoints) {
      expect(payload.spec.endpoints[0].port).toEqual(portName);
      expect(payload.spec.endpoints[0].path).toEqual(metricsPath);
    }
    expect(payload.spec?.selector.matchLabels).toHaveProperty("app", "test");
  });
});
