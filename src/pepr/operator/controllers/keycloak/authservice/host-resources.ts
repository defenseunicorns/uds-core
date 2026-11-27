/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */
import { K8s, kind } from "pepr";
import {
  IstioAuthorizationPolicy,
  IstioRequestAuthentication,
  IstioVirtualService,
  UDSPackage,
} from "../../../crd";
import { TrafficExtension } from "../../../crd/generated/istio/trafficextension-v1alpha1";
import { protectedServiceError } from "../../../crd/validators/host-service";
import {
  selectorsOverlap,
  validateHostAuthentication,
} from "../../../crd/validators/host-authentication";
import { Component, setupLogger } from "../../../../logger";
import { deleteResourceIfUnchanged, getHostExposure, retryWithDelay } from "../../utils";
import { serviceAccountSubject } from "../clients/client-credentials";
import { gatewayNamespace, hostManifests } from "./host-manifests";

const log = setupLogger(Component.OPERATOR_AUTHSERVICE);
const resourceTypes = {
  AuthorizationPolicy: IstioAuthorizationPolicy,
  RequestAuthentication: IstioRequestAuthentication,
  TrafficExtension,
};

export async function resolveHostSelectors(pkg: UDSPackage): Promise<void> {
  const exposures = pkg.spec?.network?.expose ?? [];
  const error = validateHostAuthentication(pkg);
  if (error) throw new Error(error);
  const protectedExposures = (pkg.spec?.sso ?? [])
    .map(sso => getHostExposure(pkg, sso))
    .filter(expose => expose !== undefined);
  if (!protectedExposures.length) return;

  const services = await K8s(kind.Service).InNamespace(pkg.metadata!.namespace!).Get();
  for (const expose of protectedExposures) {
    const service = services.items.find(s => s.metadata?.name === expose.service);
    const serviceError = protectedServiceError(expose, service);
    if (serviceError) throw new Error(serviceError);
    const selector = service!.spec!.selector!;

    for (const other of exposures.filter(e => e !== expose && e.service)) {
      const otherService = services.items.find(s => s.metadata?.name === other.service);
      const otherSelector = otherService?.spec?.selector;
      if (
        otherService?.spec?.type === "ExternalName" ||
        !otherSelector ||
        selectorsOverlap(selector, otherSelector)
      ) {
        throw new Error(`Cannot isolate ${expose.service} from ${other.service}`);
      }
    }
    if (
      pkg.spec?.sso?.some(
        s => s.enableAuthserviceSelector && selectorsOverlap(s.enableAuthserviceSelector, selector),
      )
    ) {
      throw new Error(`Legacy Authservice selector overlaps ${expose.service}`);
    }
    expose.selector = selector;
  }
}

export async function applyHostPolicies(pkg: UDSPackage): Promise<void> {
  const clients = pkg.spec?.sso ?? [];
  const browsers = clients.filter(s => s.authservice);
  if (!browsers.length) return;

  const namespace = pkg.metadata!.namespace!;
  const ns = await K8s(kind.Namespace).Get(namespace);
  for (const browser of browsers) {
    const expose = getHostExposure(pkg, browser)!;
    const machines: { clientId: string; subject: string }[] = [];
    for (const machine of clients.filter(
      s => s.machineAccess?.authserviceClientId === browser.clientId,
    )) {
      machines.push({
        clientId: machine.clientId,
        subject: await serviceAccountSubject(machine.clientId),
      });
    }
    for (const resource of hostManifests(pkg, expose, browser, machines, ns.metadata!.uid!)) {
      await K8s(resourceTypes[resource.kind]).Apply(resource, { force: true });
    }
  }
}

export async function purgeHostPolicies(pkg: UDSPackage, deleting = false): Promise<void> {
  const shouldRemove = (resource: {
    metadata?: { name?: string; labels?: Record<string, string> };
  }) =>
    resource.metadata?.name?.startsWith(`host-auth-${pkg.metadata!.uid}-`) &&
    (deleting || Number(resource.metadata.labels?.["uds/generation"]) < pkg.metadata!.generation!);
  for (const namespace of [gatewayNamespace, pkg.metadata!.namespace!]) {
    for (const type of Object.values(resourceTypes)) {
      const query = K8s(type)
        .InNamespace(namespace)
        .WithLabel("uds/package", pkg.metadata!.name!)
        .WithLabel("uds/for", "host-auth");
      const stale = (await query.Get()).items.filter(shouldRemove);
      for (const resource of stale) await deleteResourceIfUnchanged(resource);
      if (stale.length && (await query.Get()).items.some(shouldRemove)) {
        throw new Error(`Waiting for obsolete host policies in ${namespace} to be removed`);
      }
    }
  }
}

export async function cleanupHostAuthentication(pkg: UDSPackage): Promise<void> {
  const routes = K8s(IstioVirtualService)
    .InNamespace(pkg.metadata!.namespace!)
    .WithLabel("uds/package", pkg.metadata!.name!)
    .WithLabel("uds/for", "host-auth");
  await retryWithDelay(async () => {
    const { items } = await routes.Get();
    for (const route of items) await deleteResourceIfUnchanged(route);
    if (items.length && (await routes.Get()).items.length)
      throw new Error("Waiting for protected VirtualServices to be removed");
  }, log);
  await retryWithDelay(() => purgeHostPolicies(pkg, true), log);
}
