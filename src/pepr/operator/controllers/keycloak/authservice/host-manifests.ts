/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */
import { Expose, Sso, UDSPackage } from "../../../crd";
import { Mode } from "../../../crd/generated/package-v1alpha1";
import { UDSConfig } from "../../config/config";
import { getFqdn, hostAuthRouteName } from "../../domain-utils";
import { getOwnerRef } from "../../utils";
import { getWaypointName } from "../../istio/waypoint-utils";
import { buildAuthenticationPolicies } from "./host-authentication-policies";
import { buildAuthorizationPolicies } from "./host-authorization-policies";
import { computeMonitorExemptions } from "../../monitoring/monitor-exemptions";
import { buildIngressFilter } from "./host-ingress-filter";
import { buildWorkloadFilter } from "./host-workload-filter";

export const gatewayNamespace = "istio-tenant-gateway";
const gatewaySelector = { selector: { matchLabels: { app: "tenant-ingressgateway" } } };

export function hostManifests(
  pkg: UDSPackage,
  expose: Expose,
  browser: Sso,
  machines: { clientId: string; subject: string }[],
  namespaceUid: string,
) {
  const namespace = pkg.metadata!.namespace!;
  const metadata = createMetadata(pkg, expose, namespaceUid);
  const isSidecar = pkg.spec?.network?.serviceMesh?.mode === Mode.Sidecar;
  const workloadTarget = isSidecar
    ? { selector: { matchLabels: expose.selector! } }
    : {
        targetRefs: [
          {
            group: "gateway.networking.k8s.io",
            kind: "Gateway",
            name: getWaypointName(browser.clientId),
          },
        ],
      };
  const host = getFqdn(expose);
  const issuer = `https://sso.${UDSConfig.domain}/realms/uds`;
  const authenticationSpecs = buildAuthenticationPolicies(issuer, browser.clientId);
  const authorizationSpecs = buildAuthorizationPolicies(
    issuer,
    browser.clientId,
    [host, `${host}:*`],
    machines,
    gatewayNamespace,
    isSidecar,
    computeMonitorExemptions(pkg, expose.selector!, true),
  );
  // Apply the classifier before enforcement and the route marker last.
  return [
    {
      kind: "TrafficExtension",
      metadata: metadata("channel", namespace),
      spec: {
        ...workloadTarget,
        ...buildWorkloadFilter(isSidecar, expose.targetPort ?? expose.port!),
      },
    },
    {
      kind: "AuthorizationPolicy",
      metadata: metadata("browser", gatewayNamespace),
      spec: { ...gatewaySelector, ...authorizationSpecs.browser },
    },
    {
      kind: "AuthorizationPolicy",
      metadata: metadata("ingress", gatewayNamespace),
      spec: { ...gatewaySelector, ...authorizationSpecs.ingress },
    },
    {
      kind: "AuthorizationPolicy",
      metadata: metadata("workload", namespace),
      spec: { ...workloadTarget, ...authorizationSpecs.workload },
    },
    {
      kind: "RequestAuthentication",
      metadata: metadata("ingress", gatewayNamespace),
      spec: { ...gatewaySelector, ...authenticationSpecs.ingress },
    },
    {
      kind: "RequestAuthentication",
      metadata: metadata("workload", namespace),
      spec: { ...workloadTarget, ...authenticationSpecs.workload },
    },
    {
      kind: "TrafficExtension",
      metadata: metadata("forward", gatewayNamespace),
      spec: { ...gatewaySelector, ...buildIngressFilter(host, hostAuthRouteName(pkg, expose)) },
    },
  ] as const;
}

function createMetadata(pkg: UDSPackage, expose: Expose, namespaceUid: string) {
  const namespace = pkg.metadata!.namespace!;
  const generation = (pkg.metadata?.generation ?? 0).toString();
  const ownerRefs = getOwnerRef(pkg);
  const id = `${pkg.metadata!.uid}-${generation}-${pkg.spec!.network!.expose!.indexOf(expose)}`;
  return (suffix: string, ns: string) => ({
    name: `host-auth-${id}-${suffix}`,
    namespace: ns,
    ownerReferences:
      ns === gatewayNamespace
        ? [{ apiVersion: "v1", kind: "Namespace", name: namespace, uid: namespaceUid }]
        : ownerRefs,
    labels: {
      "uds/package": pkg.metadata!.name!,
      "uds/for": "host-auth",
      "uds/generation": generation,
    },
  });
}
