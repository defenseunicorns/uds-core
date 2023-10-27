import { Capability, K8s, Log, a, kind } from "pepr";

import { Gateway } from "../crds/gateway-v1beta1";
import {
  PurpleDestination,
  VirtualService,
} from "../crds/virtualservice-v1beta1";

export const IstioVirtualService = new Capability({
  name: "istio-virtual-service",
  description: "Generate Istio VirtualService resources",
});

// Use the 'When' function to create a new action
const { When, Store } = IstioVirtualService;

// Define the configuration keys
enum config {
  Gateway = "uds/istio-gateway",
  Host = "uds/istio-host",
  Port = "uds/istio-port",
  Domain = "uds/istio-domain",
}

// Define the valid gateway names
const validGateway = ["admin", "tenant", "passthrough"];

// Watch Gateways to get the HTTPS domain for each gateway
When(Gateway)
  .IsCreatedOrUpdated()
  .WithLabel(config.Domain)
  .Watch(vs => {
    // Store the domain for the gateway
    Store.setItem(vs.metadata.name, vs.metadata.labels[config.Domain]);
  });

// Watch ConfigMaps with the "uds/istio-gateway" label to generate a VirtualServices
When(a.ConfigMap)
  .IsCreatedOrUpdated()
  .WithLabel(config.Gateway)
  .Watch(async cm => {
    // Strip "uds-" prefix from the name
    const prefix = new RegExp(`^uds-`);
    const name = cm.metadata.name.replace(prefix, "");

    try {
      const svc = await K8s(kind.Service)
        .InNamespace(cm.metadata.namespace)
        .Get(name);

      // use the labels from the ConfigMap
      svc.metadata.labels = cm.metadata.labels;

      await handleSvc(svc);
    } catch (e) {
      Log.error(e, `Error getting Svc ${cm.metadata.namespace}/${name}`);
    }
  });

// Watch Services with the "uds/istio-gateway" label to generate a VirtualServices
When(a.Service).IsCreatedOrUpdated().WithLabel(config.Gateway).Watch(handleSvc);

async function handleSvc(svc: a.Service) {
  const logTitle = `VirtualService ${svc.metadata.namespace}/${svc.metadata.name}`;

  try {
    // Validate the gateway
    const gateway = svc.metadata.labels[config.Gateway];
    if (!validGateway.includes(gateway)) {
      Log.error(`Invalid gateway: ${gateway}`);
      return;
    }

    // Get the gateway name
    const gateways = [`istio-${gateway}-gateway/${gateway}-gateway`];

    // Get the domain for the gateway
    const domain = Store.getItem(`${gateway}-gateway`);

    // Get any the host or fallback to a wildcard
    const hostPrefix = svc.metadata.labels[config.Host] || "*";

    // Append the domain, if present
    const hosts = [hostPrefix + (domain ? `.${domain}` : "")];

    // Get the port number
    const number =
      // Try to parse the port number from the label
      parseInt(svc.metadata.labels[config.Port]) ||
      // Try to parse the port number from a named port
      svc.spec.ports.find(p => p.name.includes("http"))?.port ||
      // Fallback to the first port
      svc.spec.ports[0].port;

    // Create the destination
    const destination: PurpleDestination = {
      host: `${svc.metadata.name}.${svc.metadata.namespace}.svc.cluster.local`,
      port: { number },
    };

    // Establish the owner ref
    const ownerReference = {
      apiVersion: svc.apiVersion,
      uid: svc.metadata.uid,
      kind: svc.kind,
      name: svc.metadata.name,
    };

    const payload = {
      metadata: {
        name: svc.metadata.name,
        namespace: svc.metadata.namespace,
        ownerReferences: [ownerReference],
      },
      spec: {
        hosts,
        gateways,
        http: [{ route: [{ destination }] }],
      },
    };

    Log.debug(payload, `Applying ${logTitle}`);

    // Apply the VirtualService
    await K8s(VirtualService).Apply(payload);

    Log.info(`Applied ${logTitle}`);
  } catch (e) {
    Log.error(e, `Error applying ${logTitle}`);
  }
}
