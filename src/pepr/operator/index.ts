// Common imports
import { a } from "pepr";
import { When } from "./common";

// Controller imports
import { removeExemptions } from "./controllers/exemptions/exemptions";
import { cleanupNamespace } from "./controllers/istio/injection";
import { purgeSSOClients } from "./controllers/keycloak/client-sync";
import {
  initAPIServerCIDR,
  updateAPIServerCIDRFromEndpointSlice,
  updateAPIServerCIDRFromService,
} from "./controllers/network/generators/kubeAPI";

// CRD imports
import { UDSExemption, UDSPackage } from "./crd";
import { exemptValidator } from "./crd/validators/exempt-validator";
import { validator } from "./crd/validators/package-validator";

// Reconciler imports
import { exemptReconciler } from "./reconcilers/exempt-reconciler";
import { packageReconciler } from "./reconcilers/package-reconciler";

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
  .Watch(updateAPIServerCIDRFromEndpointSlice);

// Watch for changes to the API server Service and update the API server CIDR
When(a.Service)
  .IsCreatedOrUpdated()
  .InNamespace("default")
  .WithName("kubernetes")
  .Watch(updateAPIServerCIDRFromService);

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
  .Reconcile(packageReconciler);

//Watch for changes to the UDSExemption CRD and cleanup exemptions in policies Store
When(UDSExemption).IsDeleted().Watch(removeExemptions);

// Watch for changes to the UDSExemption CRD to enqueue an exemption for processing
When(UDSExemption).IsCreatedOrUpdated().Validate(exemptValidator).Reconcile(exemptReconciler);
