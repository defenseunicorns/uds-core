import { V1NetworkPolicyPeer } from "@kubernetes/client-node";

// Temporary fix for upstream ks8 client-node issue

declare module "@kubernetes/client-node" {
  interface V1NetworkPolicyIngressRule {
    /**
     * List of sources which should be able to access the pods selected for this rule. Items in this list are combined using a logical OR operation. If this field is empty or missing, this rule matches all sources (traffic not restricted by source). If this field is present and contains at least one item, this rule allows traffic only if the traffic matches at least one item in the from list.
     *
     * Note: use this field and not `_from`
     */
    from?: Array<V1NetworkPolicyPeer>;
  }
}
