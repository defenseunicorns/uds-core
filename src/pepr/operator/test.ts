import { K8s } from "pepr";
import { UDSPackage } from "./crd";
import { Direction } from "./crd/generated/package-v1alpha1";

K8s(UDSPackage)
  .Apply({
    metadata: {
      name: "testing-123",
      namespace: "demo",
    },
    spec: {
      network: {
        policies: {
          allow: [
            {
              name: "some-cool-test",
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
    },
  })
  .then(pkg => {
    console.log(pkg);
  })
  .catch(err => {
    console.error(err);
  });
