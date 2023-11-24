import { Exempt } from ".";

export const neuvector: Record<string, Exempt> = {
  controller: {
    namespace: "neuvector",
    name: /^neuvector-controller-pod.*/,
  },
  enforcer: {
    namespace: "neuvector",
    name: /^neuvector-enforcer-pod.*/,
  },
};
