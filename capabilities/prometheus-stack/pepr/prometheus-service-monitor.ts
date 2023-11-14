import { Capability, K8s, Log, a, kind } from "pepr";

import { ServiceMonitor, Scheme } from "./crds/servicemonitor-v1";

export const PrometheusServiceMonitor = new Capability({
  name: "prometheus-service-monitor",
  description: "Generate Prometheus ServiceMonitor resources",
});

// Use the 'When' function to create a new action
const { When } = PrometheusServiceMonitor;

// Define the configuration keys
enum config {
  // Port that metrics are served on
  Port = "uds/prometheus-port",
  // Unique selector label for the service
  Label = "uds/prometheus-name",
}

// Watch ConfigMaps with the "uds/prometheus-port" label to generate a ServiceMonitor
When(a.ConfigMap)
  .IsCreatedOrUpdated()
  .WithLabel(config.Port)
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

      // Update labels on the live service for selecting
      svc.metadata.managedFields = null;
      await K8s(kind.Service).Apply(svc)

      await handleSvc(svc);
    } catch (e) {
      Log.error(e, `Error getting Svc ${cm.metadata.namespace}/${name}`);
    }
  });

// Watch Services with the "uds/prometheus-port" label to generate a ServiceMonitor
When(a.Service).IsCreatedOrUpdated().WithLabel(config.Port).Watch(handleSvc);

async function handleSvc(svc: a.Service) {
  const logTitle = `ServiceMonitor ${svc.metadata.namespace}/${svc.metadata.name}`;

  try {
    // Get the port name or number
    const port =
      // Try to parse the port number from the label
      svc.metadata.labels[config.Port] ||
      // Try to parse the port number from a named port
      svc.spec.ports.find(p => p.name.includes("metrics"))?.port ||
      // Fallback to the first port
      svc.spec.ports[0].port;

    // Establish the owner ref
    const ownerReference = {
      apiVersion: svc.apiVersion,
      uid: svc.metadata.uid,
      kind: svc.kind,
      name: svc.metadata.name,
    };

    const endpoint = {
      port: port.toString(),
      // This is pulled from https://istio.io/latest/docs/ops/integrations/prometheus/#tls-settings
      scheme: Scheme.HTTPS,
      tlsConfig: {
        caFile: "/etc/prom-certs/root-cert.pem",
        certFile: "/etc/prom-certs/cert-chain.pem",
        keyFile: "/etc/prom-certs/key.pem",
        insecureSkipVerify: true,
      },
    };

    const selector = {
      matchLabels: {
        [config.Label]: svc.metadata.labels[config.Label],
      },
    };

    const payload = {
      metadata: {
        name: svc.metadata.name,
        namespace: svc.metadata.namespace,
        ownerReferences: [ownerReference],
      },
      spec: {
        endpoints: [endpoint],
        selector: selector,
      },
    };

    Log.debug(payload, `Applying ${logTitle}`);

    // Apply the ServiceMonitor
    await K8s(ServiceMonitor).Apply(payload);

    Log.info(`Applied ${logTitle}`);
  } catch (e) {
    Log.error(e, `Error applying ${logTitle}`);
  }
}
