/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import yaml from "js-yaml";
import { K8s, kind } from "pepr";
import { Component, setupLogger } from "../../../logger";
import { reloadPods } from "../reload/reload-utils";

export const TENANT_GATEWAY_NAMESPACE = "istio-tenant-gateway";
export const ADMIN_GATEWAY_NAMESPACE = "istio-admin-gateway";
export const RESTART_REASON = "Restarting Gateway Pods to apply new Istio configuration";

const log = setupLogger(Component.OPERATOR_ISTIO);

interface IstioConfiguration {
  defaultConfig?: {
    gatewayTopology?: {
      forwardClientCertDetails?: string;
      numTrustedProxies?: number;
    };
  };
}

let lastSeenMeshConfig: IstioConfiguration | undefined;

export async function restartGatewayPods(istioConfig: kind.ConfigMap): Promise<void> {
  const mesh = istioConfig?.data?.["mesh"];

  if (mesh) {
    const meshConfig = yaml.load(mesh) as IstioConfiguration;
    if (
      meshConfig.defaultConfig?.gatewayTopology?.numTrustedProxies !==
        lastSeenMeshConfig?.defaultConfig?.gatewayTopology?.numTrustedProxies ||
      meshConfig.defaultConfig?.gatewayTopology?.forwardClientCertDetails !==
        lastSeenMeshConfig?.defaultConfig?.gatewayTopology?.forwardClientCertDetails
    ) {
      lastSeenMeshConfig = meshConfig;

      const tenantGatewayPods = await K8s(kind.Pod).InNamespace(TENANT_GATEWAY_NAMESPACE).Get();
      const adminGatewayPods = await K8s(kind.Pod).InNamespace(ADMIN_GATEWAY_NAMESPACE).Get();

      log.info({ TENANT_GATEWAY_NAMESPACE }, "Restarting {} pods to apply new configuration");
      await reloadPods(
        TENANT_GATEWAY_NAMESPACE,
        tenantGatewayPods.items,
        RESTART_REASON,
        log,
        "ConfigMapChanged",
      );

      log.info({ ADMIN_GATEWAY_NAMESPACE }, "Restarting {} pods to apply new configuration");
      await reloadPods(
        ADMIN_GATEWAY_NAMESPACE,
        adminGatewayPods.items,
        RESTART_REASON,
        log,
        "ConfigMapChanged",
      );
    }
  }
}
