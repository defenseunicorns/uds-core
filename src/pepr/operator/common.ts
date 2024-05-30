import { Capability } from "pepr";
import { registerCRDs } from "./crd/register";

// Apply the CRDs to the cluster
void registerCRDs();

export const operator = new Capability({
  name: "uds-core-operator",
  description: "The UDS Operator is responsible for managing the lifecycle of UDS resources",
});

export const { Store, When } = operator;
