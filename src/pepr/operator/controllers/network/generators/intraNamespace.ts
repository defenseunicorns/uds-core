import { V1NetworkPolicyPeer } from "@kubernetes/client-node";

/** Matches any pod in the namespace */
export const intraNamespace: V1NetworkPolicyPeer = {
  podSelector: {
    matchLabels: {},
  },
};
