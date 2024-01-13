import { Capability, a } from "pepr";

import { cleanupNamespace } from "./controllers/istio/injection";
import { initAPIServerCIDR, updateAPIServerCIDR } from "./controllers/network/generators/kubeAPI";
import { UDSPackage } from "./crd";
import "./crd/register";
import { validator } from "./crd/validator";
import { Queue } from "./enqueue";

export const operator = new Capability({
  name: "uds-core-operator",
  description: "The UDS Operator is responsible for managing the lifecycle of UDS resources",
});

export const { Store, When } = operator;

// Create a queue to process the packages in serial order
const queue = new Queue();

// Pre-populate the API server CIDR since we are not persisting the EndpointSlice
// Note ignore any errors since the watch will still be running hereafter
void initAPIServerCIDR();

// Watch for changes to the API server EndpointSlice and update the API server CIDR
When(a.EndpointSlice)
  .IsCreatedOrUpdated()
  .InNamespace("default")
  .WithName("kubernetes")
  .Watch(updateAPIServerCIDR);

// Watch for changes to the UDSPackage CRD and cleanup the namespace mutations
When(UDSPackage).IsDeleted().Watch(cleanupNamespace);

// Watch for changes to the UDSPackage CRD to enqueue a package for processing
When(UDSPackage)
  .IsCreatedOrUpdated()
  // Advanced CR validation
  .Validate(validator)
  // Enqueue the package for processing
  .Watch(pkg => queue.enqueue(pkg));
