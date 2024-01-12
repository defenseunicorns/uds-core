import { Capability } from "pepr";

import {  cleanupNamespace } from "./controllers/istio/injection";
import { UDSPackage } from "./crd";
import "./crd/register";
import { validator } from "./crd/validator";
import { Queue } from "./enqueue";

export const operator = new Capability({
  name: "uds-core-operator",
  description: "The UDS Operator is responsible for managing the lifecycle of UDS resources",
});

export const { Store, When } = operator;

const queue = new Queue();

// Watch for changes to the UDSPackage CRD to remove the finalizer
When(UDSPackage).IsDeleted().Watch(cleanupNamespace);

// Watch for changes to the UDSPackage CRD to enqueue a package for processing
When(UDSPackage)
  .IsCreatedOrUpdated()
  // Advanced CR validation
  .Validate(validator)
  // Enqueue the package for processing
  .Watch(pkg => queue.enqueue(pkg));
