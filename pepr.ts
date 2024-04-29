import { PeprModule } from "pepr";

import cfg from "./package.json";

import { istio } from "./src/pepr/istio";
import { operator } from "./src/pepr/operator";
import { policies } from "./src/pepr/policies";
import { prometheus } from "./src/pepr/prometheus";

new PeprModule(cfg, [
  // UDS Core Operator
  operator,

  // UDS Core Policies
  policies,

  // Istio service mesh
  istio,

  // Prometheus monitoring stack
  prometheus,
]);
