import { K8s, Log, a, kind } from "pepr";
import { When } from "../common";

import { allowEgressDNS } from "./allow-egress-dns";
import { allowEgressIstiod } from "./allow-egress-istiod";
import { allowEgressWithinNS } from "./allow-egress-within-ns";
import { allowIngressSidecarMonitoring } from "./allow-ingress-sidecar-monitoring";
import { allowIngressWithinNS } from "./allow-ingress-within-ns";
import { defaultDenyAll } from "./default-deny-all";

const ignoredNamespaces = [
  "kube-node-lease",
  "kube-public",
  "kube-system",
  "pepr-system",
  "uds-dev-stack",
  "zarf",
];

When(a.Namespace)
  .IsCreatedOrUpdated()
  .Watch(async ns => {
    if (!ns.metadata?.name || ignoredNamespaces.includes(ns.metadata.name)) {
      return;
    }

    try {
      const name = ns.metadata.name;

      const policies = [
        // All traffic must be explicitly allowed
        defaultDenyAll(name),

        // General egress rules
        allowEgressDNS(name),
        allowEgressIstiod(name),
        allowEgressWithinNS(name),

        // Ingress rules
        allowIngressSidecarMonitoring(name),
        allowIngressWithinNS(name),
      ];

      for (const policy of policies) {
        // Temporary override until https://github.com/defenseunicorns/pepr/pull/396 is released
        const tmpOverride = {
          kindOverride: {
            kind: "NetworkPolicy",
            version: "v1",
            group: "networking.k8s.io",
            plural: "networkpolicies",
          },
        };

        // Apply the policy, overwriting any existing policy
        await K8s(kind.NetworkPolicy, tmpOverride).Apply(policy);
      }
    } catch (err) {
      Log.error(err);
    }
  });
