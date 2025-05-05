/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { Capability, a } from "pepr";
import { Component, setupLogger } from "../logger";

export const patches = new Capability({
  name: "patches",
  description: "UDS Core Capability for patching miscellaneous things.",
});

const { When } = patches;

// configure subproject logger
const log = setupLogger(Component.PATCHES);

/**
 * Mutate the Loki backend headless support to handle Istio protocol selection properly
 * Temporary until fixed upstream in https://github.com/grafana/loki/pull/14507
 */
When(a.Service)
  .IsCreatedOrUpdated()
  .InNamespace("loki")
  .WithName("loki-backend-headless")
  .Mutate(async svc => {
    if (svc.Raw.spec === undefined || svc.Raw.spec.ports === undefined) {
      return;
    }

    log.debug("Patching loki-backend-headless service to add appProtocol");

    const ports = svc.Raw.spec.ports;

    const grpcPort = ports.find(p => p.name === "grpc");

    // If found, set appProtocol to "tcp"
    if (grpcPort) {
      grpcPort.appProtocol = "tcp";
    }
  });

/**
 * Mutate the Neuvector Enforcer DaemonSet to add a livenessProbe
 */
When(a.DaemonSet)
  .IsCreatedOrUpdated()
  .InNamespace("neuvector")
  .WithName("neuvector-enforcer-pod")
  .Mutate(async ds => {
    const enforcerContainer = ds.Raw.spec?.template.spec?.containers.find(
      container => container.name === "neuvector-enforcer-pod",
    );

    if (enforcerContainer && enforcerContainer.livenessProbe === undefined) {
      log.debug("Patching NeuVector Enforcer Daemonset to add livenessProbe");
      const livenessProbe = {
        http: { port: 8500 },
        periodSeconds: 30,
        failureThreshold: 3,
      };
      enforcerContainer.livenessProbe = livenessProbe;
    }

    if (enforcerContainer && enforcerContainer.readinessProbe === undefined) {
      log.debug("Patching NeuVector Enforcer Daemonset to add readinessProbe");
      const readinessProbe = {
        http: { port: 8500 },
        initialDelaySeconds: 30,
        periodSeconds: 30,
        failureThreshold: 3,
      };
      enforcerContainer.readinessProbe = readinessProbe;
    }
  });

/**
 * Mutate the Neuvector Controller Deployment to patch in new readinessProbe
 * See issue for reference: https://github.com/defenseunicorns/uds-core/issues/1446
 * This can be moved to values when probes are supported in the chart: https://github.com/neuvector/neuvector-helm/pull/487
 */
When(a.Deployment)
  .IsCreatedOrUpdated()
  .InNamespace("neuvector")
  .WithName("neuvector-controller-pod")
  .Mutate(async deploy => {
    const controllerContainer = deploy.Raw.spec?.template.spec?.containers.find(
      container => container.name === "neuvector-controller-pod",
    );

    if (controllerContainer) {
      log.debug("Patching NeuVector Controller deployment to modify readinessProbe");
      const readinessProbe = {
        // Probe default port for controller REST API server
        tcpSocket: { port: 10443 },
      };
      controllerContainer.readinessProbe = readinessProbe;
    }
  });

/**
 * Mutate the Neuvector controller service to publish not ready addresses
 */
When(a.Service)
  .IsCreatedOrUpdated()
  .InNamespace("neuvector")
  .WithName("neuvector-svc-controller")
  .Mutate(async svc => {
    log.debug("Patching NeuVector Controller service to publish not ready addresses");
    svc.Raw.spec!.publishNotReadyAddresses = true;
  });

/**
 * Mutate the Neuvector UI service to add labels to use the waypoint
 * This can be moved to values when labels are supported in the chart: https://github.com/neuvector/neuvector-helm/pull/487
 */
When(a.Service)
  .IsCreatedOrUpdated()
  .InNamespace("neuvector")
  .WithName("neuvector-service-webui")
  .Mutate(async svc => {
    log.debug("Patching NeuVector Manager service to use the waypoint");
    svc.SetLabel("istio.io/ingress-use-waypoint", "true");
    svc.SetLabel("istio.io/use-waypoint", "neuvector-manager-waypoint");
  });
