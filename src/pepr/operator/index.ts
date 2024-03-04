import { a } from "pepr";

import { When } from "./common";
import { cleanupNamespace } from "./controllers/istio/injection";
import { purgeSSOClients } from "./controllers/keycloak/client-sync";
import { initAPIServerCIDR, updateAPIServerCIDR } from "./controllers/network/generators/kubeAPI";
import { UDSPackage } from "./crd";
import { validator } from "./crd/validator";
import { reconciler } from "./reconciler";

// Export the operator capability for registration in the root pepr.ts
export { operator } from "./common";

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
When(UDSPackage)
  .IsDeleted()
  .Watch(async pkg => {
    // Cleanup the namespace
    await cleanupNamespace(pkg);

    // Remove any SSO clients
    await purgeSSOClients(pkg, []);
  });

// Watch for changes to the UDSPackage CRD to enqueue a package for processing
When(UDSPackage)
  .IsCreatedOrUpdated()
  // Advanced CR validation
  .Validate(validator)
  // Enqueue the package for processing
  .Reconcile(reconciler);
