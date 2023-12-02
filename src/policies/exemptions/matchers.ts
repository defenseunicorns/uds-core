import { Exempt } from ".";

export const neuvector = {
  controller: {
    namespace: "neuvector",
    name: /^neuvector-controller-pod.*/,
  } as Exempt,
  enforcer: {
    namespace: "neuvector",
    name: /^neuvector-enforcer-pod.*/,
  } as Exempt,
  prometheus: {
    namespace: "neuvector",
    name: /^neuvector-prometheus-exporter-pod.*/,
  } as Exempt,
};

export const monitoring = {
  promtail: {
    namespace: "promtail",
    name: /^promtail-.*/,
  } as Exempt,

  prometheusStackExporter: {
    namespace: "monitoring",
    name: /^kube-prometheus-stack-prometheus-node-exporter-.*/,
  } as Exempt,

  prometheusOperator: {
    namespace: "monitoring",
    name: /^prometheus-kube-prometheus-stack-prometheus-.*/,
  } as Exempt,
};
