import { K8s, Log, a, kind } from "pepr";

import { Store, When } from "./common";
import { Gateway } from "./crds/gateway-v1beta1";
import { PurpleDestination, VirtualService } from "./crds/virtualservice-v1beta1";

// Define the configuration keys
enum config {
  Gateway = "uds/istio-gateway",
  Host = "uds/istio-host",
  Port = "uds/istio-port",
  Domain = "uds/istio-domain",
}

// Define the valid gateway names
const validGateway = ["admin", "tenant", "passthrough"];

// Watch ConfigMaps with the "uds/istio-gateway" label to generate a VirtualServices
When(a.ConfigMap)
  .IsCreatedOrUpdated()
  .WithLabel(config.Gateway)
  .Watch(async cm => {
    if (!cm.metadata?.name || !cm.metadata.namespace || !cm.metadata.labels) {
      Log.error(cm, `Invalid ConfigMap definition`);
      return;
    }

    // Strip "uds-" prefix from the name
    const prefix = new RegExp(`^uds-`);
    const name = cm.metadata.name.replace(prefix, "");

    try {
      const svc = await K8s(kind.Service).InNamespace(cm.metadata.namespace).Get(name);

      svc.metadata = svc.metadata || {};

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
  if (!svc.metadata?.labels || !svc.metadata.name || !svc.metadata.uid || !svc.spec?.ports) {
    Log.error(svc, `Invalid service definition`);
    return;
  }

  const logTitle = `VirtualService ${svc.metadata.namespace}/${svc.metadata.name}`;

  try {
    // Validate the gateway
    const gateway = svc.metadata.labels?.[config.Gateway];
    if (!gateway || !validGateway.includes(gateway)) {
      Log.error(`Invalid gateway: ${gateway}`);
      return;
    }

    // Get the gateway name
    const gwNamespace = `istio-${gateway}-gateway`;
    const gwName = `${gateway}-gateway`;

    // Get the domain for the gateway
    let domain = Store.getItem(gwName);

    // If the domain is not present, fetch it from the Gateway and store it
    if (!domain) {
      const gw = await K8s(Gateway).InNamespace(gwNamespace).Get(gwName);
      domain = gw.metadata?.labels?.[config.Domain] || "";

      // Store the domain for the gateway
      if (domain) {
        Store.setItem(gwName, domain);
      }
    }

    // Get any the host or fallback to a wildcard
    const hostPrefix = svc.metadata.labels[config.Host] || "*";

    // Append the domain, if present
    const hosts = [hostPrefix + (domain ? `.${domain}` : "")];

    // Get the port number
    const number =
      // Try to parse the port number from the label
      parseInt(svc.metadata.labels[config.Port]) ||
      // Try to parse the port number from a named port
      svc.spec.ports.find(p => p.name?.includes("http"))?.port ||
      // Fallback to the first port
      svc.spec.ports[0].port;

    // Create the destination
    const destination: PurpleDestination = {
      host: `${svc.metadata.name}.${svc.metadata.namespace}.svc.cluster.local`,
      port: { number },
    };

    const payload: VirtualService = {
      metadata: {
        name: svc.metadata.name,
        namespace: svc.metadata.namespace,
        // Establish the owner ref
        ownerReferences: [
          {
            apiVersion: svc.apiVersion!,
            kind: svc.kind!,
            uid: svc.metadata.uid,
            name: svc.metadata.name,
          },
        ],
      },
      spec: {
        hosts,
        gateways: [`${gwNamespace}/${gwName}`],
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
