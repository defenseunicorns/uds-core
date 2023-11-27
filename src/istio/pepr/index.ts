import { IstioInjection } from "./istio-injection";
import { IstioJobTermination } from "./istio-job-termination";
import { IstioVirtualService } from "./istio-virtual-service";

export const istio = [IstioInjection, IstioVirtualService, IstioJobTermination];
