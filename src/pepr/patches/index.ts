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
