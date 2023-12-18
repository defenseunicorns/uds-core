import { K8s, Log, PeprMutateRequest, a, kind } from "pepr";

import { Store, When } from "../../policies/common";

export enum TransformLabels {
  KEY = "uds/transform",
  API_SERVER = "api-server",
}

When(a.NetworkPolicy)
  .IsCreatedOrUpdated()
  .WithLabel(TransformLabels.KEY)
  .Mutate(async request => {
    const target = request.Raw.metadata?.labels?.[TransformLabels.KEY];

    switch (target) {
      case TransformLabels.API_SERVER:
        await apiServer(request);
        break;

      default:
        throw new Error("Invalid or missing transform label");
    }
  });

async function apiServer(request: PeprMutateRequest<a.NetworkPolicy>) {
  const types = request.Raw.spec?.policyTypes;

  if (!types || !request.Raw.spec) {
    throw new Error("You must specify at least one policyTypes");
  }

  // If the serverIP is not cached, get it from the kubernetes service
  const ipBlock = {
    cidr: Store.getItem("api-server-cidr") || "",
  };

  if (!ipBlock.cidr) {
    const svc = await K8s(kind.Service).InNamespace("default").Get("kubernetes");

    // If the IP is found, cache it
    if (svc.spec?.clusterIP) {
      ipBlock.cidr = `${svc.spec.clusterIP}/32`;
      Store.setItem("api-server-cidr", ipBlock.cidr);
    } else {
      // Otherwise, log a warning and default to 0.0.0.0/0
      Log.warn("Unable to get api-server-cidr, defaulting to 0.0.0.0/0");
      ipBlock.cidr = "0.0.0.0/0";
    }
  }

  if (types.includes("Ingress")) {
    request.Raw.spec.ingress = [{ from: [{ ipBlock }] }];
  }

  if (types.includes("Egress")) {
    request.Raw.spec.egress = [{ to: [{ ipBlock }] }];
  }
}
