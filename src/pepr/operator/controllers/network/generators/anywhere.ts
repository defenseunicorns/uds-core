import { V1NetworkPolicyPeer } from "@kubernetes/client-node";
import { META_IP } from "./cloudMetadata";

/** Matches any endpoint EXCEPT the Cloud Meta endpoint */
export const anywhere: V1NetworkPolicyPeer = {
  ipBlock: {
    cidr: "0.0.0.0/0",
    except: [META_IP],
  },
};
