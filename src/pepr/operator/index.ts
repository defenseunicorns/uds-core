import { Capability, a } from "pepr";

import { cleanupNamespace } from "./controllers/istio/injection";
import { initAPIServerCIDR, updateAPIServerCIDR } from "./controllers/network/generators/kubeAPI";
import { Phase, UDSExemption, UDSPackage } from "./crd";
import "./crd/register";
import { validator } from "./crd/validator";
import { Queue } from "./enqueue";

import {  Log } from "pepr";
import { updateStatus } from "./reconciler";
import { addExemptions } from "./controllers/exemptions/exemptions";


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


// (TODO) remove exemptions on delete of CR
// Watch for changes to the UDSExemption CRD and cleanup the namespace mutations
// When(UDSExemption).IsDeleted().Watch(cleanupNamespace);

// todo validate
When(UDSExemption)
  .IsCreatedOrUpdated()
  .InNamespace("uds-policy-exemptions")
  .Reconcile(async (exmpt: UDSExemption) => {
    
      if (!exmpt.metadata?.namespace) {
        Log.error(exmpt, `Invalid Exemption definition`);
        return;
      }

      const isPending = exmpt.status?.phase === Phase.Pending;
      const isCurrentGeneration =
        exmpt.metadata?.generation === exmpt.status?.observedGeneration;

      if (isPending || isCurrentGeneration) {
        Log.debug(exmpt, `Skipping pending or completed exemption`);
        return;
      }

      const { namespace, name } = exmpt.metadata;

      Log.debug(exmpt, `Processing Exemption ${namespace}/${name}`);

      try {
        await updateStatus(exmpt, { phase: Phase.Pending });

        addExemptions(exmpt);

        await updateStatus(exmpt, {
          phase: Phase.Ready,
          observedGeneration: exmpt.metadata.generation,
        });
      } catch (e) {
        Log.error(e, `Error configuring for ${namespace}/${name}`);
        // todo: need to evaluate when it is safe to retry (updating generation now avoids retrying infinitely)
        void updateStatus(exmpt, {
          phase: Phase.Failed,
          observedGeneration: exmpt.metadata.generation,
        });
      }
    })