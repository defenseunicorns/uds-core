import { Log, a } from "pepr";
import { When } from "./common";
import { processExemptions, removeExemptions } from "./controllers/exemptions/exemptions";
import { cleanupNamespace } from "./controllers/istio/injection";
import { purgeSSOClients } from "./controllers/keycloak/client-sync";
import {
  initAPIServerCIDR,
  updateAPIServerCIDRFromEndpointSlice,
  updateAPIServerCIDRFromService,
} from "./controllers/network/generators/kubeAPI";
import { Phase, UDSExemption, UDSPackage } from "./crd";
import { exemptValidator } from "./crd/exempt-validator";
import "./crd/register";
import { validator } from "./crd/validator";
import { reconciler, updateStatus } from "./reconciler";

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
  .Reconcile(reconciler);

//Watch for changes to the UDSExemption CRD and cleanup exemptions in policies Store
When(UDSExemption).IsDeleted().Watch(removeExemptions);

// Watch for changes to the UDSExemption CRD to enqueue an exemption for processing
When(UDSExemption)
  .IsCreatedOrUpdated()
  .Validate(exemptValidator)
  .Reconcile(async (exempt: UDSExemption) => {
    if (!exempt.metadata?.namespace) {
      Log.error(exempt, `Invalid Exemption definition`);
      return;
    }

    const isPending = exempt.status?.phase === Phase.Pending;
    const isCurrentGeneration = exempt.metadata?.generation === exempt.status?.observedGeneration;

    if (isPending || isCurrentGeneration) {
      Log.debug(exempt, `Skipping pending or completed exemption`);
      return;
    }

    const { namespace, name } = exempt.metadata;

    Log.debug(exempt, `Processing Exemption ${namespace}/${name}`);

    try {
      await updateStatus(exempt, { phase: Phase.Pending });

      processExemptions(exempt);
      await updateStatus(exempt, {
        phase: Phase.Ready,
        observedGeneration: exempt.metadata.generation,
        titles: exempt.spec?.exemptions?.map(e => e.title || ""),
      });
    } catch (e) {
      Log.error(e, `Error configuring for ${namespace}/${name}`);
      // todo: need to evaluate when it is safe to retry (updating generation now avoids retrying infinitely)
      void updateStatus(exempt, {
        phase: Phase.Failed,
        observedGeneration: exempt.metadata.generation,
      });
    }
  });
