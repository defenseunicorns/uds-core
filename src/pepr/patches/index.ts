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
        tcpSocket: { port: 8500 },
        periodSeconds: 30,
        failureThreshold: 3,
      };
      enforcerContainer.livenessProbe = livenessProbe;
    }

    if (enforcerContainer && enforcerContainer.readinessProbe === undefined) {
      log.debug("Patching NeuVector Enforcer Daemonset to add readinessProbe");
      const readinessProbe = {
        tcpSocket: { port: 8500 },
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
 */
When(a.Deployment)
  .IsCreatedOrUpdated()
  .InNamespace("neuvector")
  .WithName("neuvector-controller-pod")
  .Mutate(async deploy => {
    const controllerContainer = deploy.Raw.spec?.template.spec?.containers.find(
      container => container.name === "neuvector-controller-pod",
    );

    if (controllerContainer && controllerContainer.readinessProbe) {
      log.debug("Patching NeuVector Controller deployment to modify readinessProbe");
      const readinessProbe = {
        // Probe default port for controller REST API server
        tcpSocket: { port: 10443 },
      };
      controllerContainer.readinessProbe = readinessProbe;
    }
  });

/**
 * Mutate the Neuvector Manager Deployment to set the entrypoint rather than using the default entrypoint scripts
 * This is a workaround for https://github.com/neuvector/neuvector/issues/1757 to support FIPS nodes
 */
When(a.Deployment)
  .IsCreatedOrUpdated()
  .InNamespace("neuvector")
  .WithName("neuvector-manager-pod")
  .Mutate(async deployment => {
    const managerContainer = deployment.Raw.spec?.template.spec?.containers.find(
      container => container.name === "neuvector-manager-pod",
    );

    if (managerContainer) {
      log.debug("Patching NeuVector Manager Deployment to modify entrypoint for FIPS node support");
      // This entrypoint matches the one used by the Unicorn and Registry1 images
      // It runs the same command as the upstream entrypoint (https://github.com/neuvector/manager/blob/v5.4.3/package/entrypoint.sh) with two changes:
      // - does not include the java security properties file as this causes failures on FIPS nodes
      // - adds "-Dcom.redhat.fips=false" arg as FIPS alignment causes failures on FIPS nodes
      managerContainer.command = [
        "java",
        "-Xms256m",
        "-Xmx2048m",
        "-Djdk.tls.rejectClientInitiatedRenegotiation=true",
        "-Dcom.redhat.fips=false",
        "-jar",
        "/usr/local/bin/admin-assembly-1.0.jar",
      ];
    }
  });
