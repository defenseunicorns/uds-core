import { K8s, kind } from "pepr";
import { UDSPackage } from "./crd";
import { Direction, Gateway } from "./crd/generated/package-v1alpha1";

const intervalMS = 50;
let inc = 0;

setInterval(async () => {
  const namespace = `bully-${inc++}`;

  await K8s(kind.Namespace).Apply({
    metadata: {
      name: namespace,
    },
  });

  const pkg = await K8s(UDSPackage).Apply({
    metadata: {
      name: `random-${Math.random() * 1000}`,
      namespace,
    },
    spec: {
      network: {
        expose: [
          {
            gateway: Gateway.Tenant,
            service: "test",
            port: 80,
            host: `test-${Math.random() * 1000}`,
            podLabels: {
              app: "some-cool-test",
            },
          },
        ],
        allow: [
          {
            direction: Direction.Ingress,
            labels: {
              demo: "test",
            },
            podLabels: {
              app: "some-cool-test",
            },
            port: 80,
            remoteNamespaceLabels: {},
          },
        ],
      },
    },
  });

  console.log(pkg);
}, intervalMS);
