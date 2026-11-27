/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */
import { isDeepStrictEqual } from "node:util";
import { K8s, kind, PeprValidateRequest } from "pepr";
import { Expose, IstioVirtualService, Phase, UDSPackage } from "..";
import { selectorsOverlap } from "./host-authentication";

export function protectedServiceError(expose: Expose, service?: kind.Service) {
  const selector = service?.spec?.selector;
  if (service?.spec?.type === "ExternalName" || !selector || !Object.keys(selector).length)
    return `Host authentication requires a selector-backed Service for ${expose.service}`;
  if (!Object.entries(expose.selector ?? {}).every(([key, value]) => selector[key] === value))
    return `Service ${expose.service} must include the Package exposure's selector labels`;
  const port = service.spec?.ports?.find(
    p => p.port === expose.port && (p.protocol ?? "TCP") === "TCP",
  );
  if (!port) return `Service ${expose.service} must expose TCP port ${expose.port}`;
  const targetPort = port.targetPort ?? port.port;
  if (typeof targetPort !== "number" || targetPort !== (expose.targetPort ?? expose.port))
    return `Service ${expose.service} target port must be numeric and match the Package exposure`;
}

async function hasPreviousRoute(pkg: UDSPackage, namespace: string, name: string) {
  const generation = pkg.metadata?.generation ?? 1;
  if (
    generation === 1 ||
    (generation === pkg.status?.observedGeneration && pkg.status.phase === Phase.Ready) ||
    !pkg.metadata?.uid
  )
    return false;
  const routes = await K8s(IstioVirtualService)
    .InNamespace(namespace)
    .WithLabel("uds/package", pkg.metadata!.name!)
    .WithLabel("uds/for", "host-auth")
    .Get();
  return routes.items.some(route =>
    route.spec?.http?.some(http =>
      http.route?.some(r => r.destination.host === `${name}.${namespace}.svc.cluster.local`),
    ),
  );
}

export async function validateHostService(req: PeprValidateRequest<kind.Service>) {
  const service = req.Raw;
  const namespace = service.metadata?.namespace ?? req.Request.namespace;
  const name = service.metadata?.name;
  const old = req.OldResource as kind.Service | undefined;
  const deleting = req.Request.operation === "DELETE";
  if (
    !deleting &&
    old &&
    old.spec?.type === service.spec?.type &&
    isDeepStrictEqual(old.spec?.selector, service.spec?.selector) &&
    isDeepStrictEqual(old.spec?.ports, service.spec?.ports)
  )
    return req.Approve();
  if (!namespace || !name) return req.Deny("Service admission requires a namespace and name");

  const packages = await K8s(UDSPackage).InNamespace(namespace).Get();
  for (const pkg of packages.items) {
    const exposures = pkg.spec?.network?.expose ?? [];
    const clients = (pkg.spec?.sso ?? []).filter(client => client.authservice);
    const protectedExposures = exposures.filter(expose =>
      clients.some(client => client.authservice!.exposeHost === expose.host),
    );
    const target = protectedExposures.find(expose => expose.service === name);

    // During a Package update the previous route can still be serving the old Service.
    const previousTarget = !target && (await hasPreviousRoute(pkg, namespace, name));
    if (deleting && (target || previousTarget)) {
      if ((await K8s(kind.Namespace).Get(namespace)).metadata?.deletionTimestamp) continue;
      return req.Deny(`Withdraw the protected Package exposure before deleting Service ${name}`);
    }
    if (previousTarget)
      return req.Deny(`Wait for the Package to withdraw the protected route to Service ${name}`);
    if (deleting) continue;
    if (target) {
      const error = protectedServiceError(target, service);
      if (error) return req.Deny(error);
      const client = clients.find(client => client.authservice!.exposeHost === target.host)!;
      const previousSelector = old
        ? old.spec?.selector
        : pkg.status?.authserviceClients?.find(sso => sso.clientId === client.clientId)?.selector;
      if (previousSelector && !isDeepStrictEqual(previousSelector, service.spec?.selector))
        return req.Deny(
          `Withdraw the protected Package exposure before changing the selector for Service ${name}`,
        );
    } else if (!exposures.some(expose => expose.service === name)) continue;
    const peers = (target ? exposures : protectedExposures).filter(
      peer => peer.service && peer.service !== name,
    );
    if (!peers.length) continue;
    const services = await K8s(kind.Service).InNamespace(namespace).Get();
    for (const peer of peers) {
      const live = services.items.find(s => s.metadata?.name === peer.service);
      // A new protected Service must include its declared labels, even if the two creates race.
      if (!live && !protectedExposures.includes(peer)) continue;
      const peerSelector = live ? live.spec?.selector : peer.selector;
      if (
        service.spec?.type === "ExternalName" ||
        live?.spec?.type === "ExternalName" ||
        !service.spec?.selector ||
        !peerSelector ||
        selectorsOverlap(service.spec.selector, peerSelector)
      )
        return req.Deny(`Cannot isolate Service ${name} from ${peer.service}`);
    }
  }
  return req.Approve();
}
