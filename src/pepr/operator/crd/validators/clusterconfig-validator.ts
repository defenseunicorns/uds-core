import { KubernetesListObject } from "kubernetes-fluent-client";
import { PeprValidateRequest } from "pepr";
import { ClusterConfig } from "../generated/clusterconfig-v1alpha1";

export async function validateConfigUpdate(req: PeprValidateRequest<ClusterConfig>) {
  // check helm annotations ?
  // check no other clusterconfig exists ?

  return req.Approve();
}

export async function validateConfigCreate(config: KubernetesListObject<ClusterConfig>) {
  if (config.items.length > 1) {
    throw new Error(
      `ClusterConfig Processing: only one ClusterConfig is allowed -- found: ${config.items.length}`,
    );
  }

  const cfg = config.items[0];

  if (cfg.metadata?.namespace !== "pepr-system" && cfg.metadata?.name !== "uds-cluster-config") {
    throw new Error("ClusterConfig Processing: namespace or name is invalid");
  }

  return true;
}
