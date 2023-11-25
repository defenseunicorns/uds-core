import { Matcher } from ".";

export const neuvector: Matcher = {
  controller: {
    namespace: "neuvector",
    name: /^neuvector-controller-pod.*/,
  },
  enforcer: {
    namespace: "neuvector",
    name: /^neuvector-enforcer-pod.*/,
  },
};

export const promtail: Matcher = {
  promtail: {
    namespace: "promtail",
    name: /^promtail-.*/,
  },
};
