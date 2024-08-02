// Common imports
import { a } from "pepr";
import { When } from "./common";

// Controller imports
import {
  initAPIServerCIDR,
  updateAPIServerCIDRFromEndpointSlice,
  updateAPIServerCIDRFromService,
} from "./controllers/network/generators/kubeAPI";

// CRD imports
import { UDSExemption, UDSPackage } from "./crd";
import { validator } from "./crd/validators/package-validator";

// Reconciler imports
import { exemptValidator } from "./crd/validators/exempt-validator";
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
  .Reconcile(updateAPIServerCIDRFromEndpointSlice);

// Watch for changes to the API server Service and update the API server CIDR
When(a.Service)
  .IsCreatedOrUpdated()
  .InNamespace("default")
  .WithName("kubernetes")
  .Reconcile(updateAPIServerCIDRFromService);

// We can't watch for deletions here because of our finalizer - deletions will appear as "updates",
// with a deletionTimestamp so they end up in the normal reconcile flow

// // Watch for changes to the UDSPackage CRD and cleanup the namespace mutations
// When(UDSPackage)
//   .IsDeleted()
//   .Watch(async pkg => {
//     // Cleanup the namespace
//     await cleanupNamespace(pkg);

//     // Remove any SSO clients
//     await purgeSSOClients(pkg, []);
//     await purgeAuthserviceClients(pkg, []);

//     // Remove Finalizer
//     await handleFinalizer(pkg, FinalizerOperation.Remove);
//   });

// Watch for changes to the UDSPackage CRD to enqueue a package for processing
When(UDSPackage)
  .IsCreatedOrUpdated()
  // Advanced CR validation
  .Validate(validator)
  // Enqueue the package for processing
  .Reconcile(packageReconciler);

// Watch for Exemptions and validate
When(UDSExemption).IsCreatedOrUpdated().Validate(exemptValidator);
