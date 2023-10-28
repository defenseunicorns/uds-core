import { PeprModule } from "pepr";

import cfg from "./package.json";

import { IstioVirtualService } from "./capabilities/istio-virtual-service";
import { IstioInjection } from "./capabilities/istio-injection";

new PeprModule(cfg, [IstioVirtualService, IstioInjection]);
