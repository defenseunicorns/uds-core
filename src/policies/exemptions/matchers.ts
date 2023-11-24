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

export const promtail: Record<string, Exempt> = {
  promtail: {
    namespace: "promtail",
    name: /^promtail-.*/,
  },
};
