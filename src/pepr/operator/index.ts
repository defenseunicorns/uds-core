import { Capability, Log } from "pepr";

import { UDSConfig } from "../config";
import { UDSPackage } from "./crd";
import "./crd/register";
import { validator } from "./crd/validator";
import { virtualService } from "./istio";
import { syncNamespace } from "./namespace";
import { networkPolicies } from "./network";

export const operator = new Capability({
  name: "uds-core-operator",
  description: "The UDS Operator is responsible for managing the lifecycle of UDS resources",
});

export const { Store, When } = operator;

When(UDSPackage)
  .IsCreatedOrUpdated()
  .Validate(validator)
  .Watch(async pkg => {
    if (!pkg.metadata?.namespace) {
      Log.error(pkg, `Invalid Package definition`);
      return;
    }

    Log.debug(pkg, `Processing Package ${pkg.metadata.namespace}/${pkg.metadata.name}`);

    // Configure the namespace and namespace-wide network policies
    try {
      const namespace = await syncNamespace(pkg);

      await networkPolicies(pkg, namespace);

      // Only configure the VirtualService if Istio is installed
      if (UDSConfig.istioInstalled) {
        await virtualService(pkg, namespace);
      } else {
        Log.warn(`Istio is not installed, skipping ${pkg.metadata.name} VirtualService.`);
      }
    } catch (e) {
      Log.error(
        e,
        `Error completing configuration for ${pkg.metadata.namespace}/${pkg.metadata.name}`,
      );
    }
  });
