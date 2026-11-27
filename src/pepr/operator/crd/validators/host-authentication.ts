/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */
import { Gateway, Sso, UDSPackage } from "..";
import { getFqdn } from "../../controllers/domain-utils";
import { getWaypointName } from "../../controllers/istio/waypoint-utils";
import { Mode } from "../generated/package-v1alpha1";

export function selectorsOverlap(a: Record<string, string>, b: Record<string, string>) {
  return Object.entries(a).every(([key, value]) => !Object.hasOwn(b, key) || b[key] === value);
}

function callbackConflict(client: Sso, callback: URL) {
  const routes = [...(client.redirectUris ?? [])];
  if (client.protocol === "saml") {
    const attributes = client.attributes ?? {};
    routes.push(
      client.adminUrl ?? "",
      ...[
        "saml_assertion_consumer_url_post",
        "saml_assertion_consumer_url_redirect",
        "saml_single_logout_service_url_post",
        "saml_single_logout_service_url_redirect",
      ].map(key => attributes[key]),
    );
  }
  return routes.some(route => {
    if (!route || !URL.canParse(route, client.rootUrl)) return false;
    const url = new URL(route, client.rootUrl);
    const path = url.pathname.replace(/\/{2,}/g, "/");
    return url.origin === callback.origin && (path === callback.pathname || path === "/logout");
  });
}

export function validateHostAuthentication(pkg: UDSPackage): string | undefined {
  const hosts = pkg.spec?.network?.expose ?? [];
  const clients = pkg.spec?.sso ?? [];
  const protectedHosts = new Set<string>();
  for (const browser of clients.filter(client => client.authservice)) {
    const host = browser.authservice!.exposeHost;
    const matches = hosts.filter(e => e.host === host);
    const [expose] = matches;
    if (!host || matches.length !== 1 || protectedHosts.has(host)) {
      return "Each authservice.exposeHost must identify exactly one exposure and one protecting client in this Package";
    }
    const { selector } = expose;
    protectedHosts.add(host);
    if (
      !expose.service ||
      !expose.port ||
      !selector ||
      !Object.keys(selector).length ||
      (expose.gateway && expose.gateway !== Gateway.Tenant) ||
      expose.domain ||
      host.includes("*") ||
      (expose.protocol && expose.protocol !== "HTTP") ||
      expose.advancedHTTP ||
      expose.match ||
      expose.uptime
    ) {
      return "Host authentication requires a tenant HTTP Service exposure without advanced routing or uptime checks";
    }
    const fqdn = getFqdn(expose);
    if (
      browser.enableAuthserviceSelector ||
      browser.publicClient ||
      browser.protocol === "saml" ||
      browser.standardFlowEnabled === false ||
      browser.serviceAccountsEnabled ||
      browser.enabled === false ||
      browser.clientAuthenticatorType === "client-jwt" ||
      !/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(browser.clientId)
    ) {
      return "Host authentication requires a confidential browser client with the standard flow enabled";
    }
    if (pkg.spec?.network?.serviceMesh?.mode !== Mode.Sidecar) {
      const waypoint = getWaypointName(browser.clientId);
      if (waypoint.length > 63)
        return "The Authservice waypoint name must fit in a 63-character Kubernetes label";
      if (
        clients.some(
          other =>
            other !== browser &&
            (other.authservice || other.enableAuthserviceSelector) &&
            other.clientId?.trim() &&
            getWaypointName(other.clientId) === waypoint,
        )
      ) {
        return "Each Ambient Authservice client must have a distinct waypoint name";
      }
    }
    const raw = browser.redirectUris?.[0];
    const uri = raw && URL.canParse(raw) ? new URL(raw) : undefined;
    if (
      !uri ||
      uri.origin !== `https://${fqdn}` ||
      raw !== uri.origin + uri.pathname ||
      uri.pathname === "/" ||
      uri.pathname === "/logout" ||
      /[%*]|\/\//.test(uri.pathname)
    ) {
      return "First browser redirect URI must be an exact HTTPS callback on the exposed host, distinct from / and /logout";
    }
    if (clients.some(other => other !== browser && callbackConflict(other, uri))) {
      return "Authservice callback or /logout overlaps another SSO client's application route";
    }
    if (
      clients.some(
        s => s.enableAuthserviceSelector && selectorsOverlap(s.enableAuthserviceSelector, selector),
      ) ||
      hosts.some(
        other =>
          other !== expose &&
          (other.service === expose.service ||
            (other.selector && selectorsOverlap(other.selector, selector)) ||
            getFqdn(other) === fqdn),
      )
    ) {
      return "Host authentication conflicts with another exposure or Authservice selector";
    }
  }
  for (const machine of clients.filter(client => client.machineAccess)) {
    const browser = clients.find(
      client => client.clientId === machine.machineAccess!.authserviceClientId,
    );
    if (!browser?.authservice) {
      return "machineAccess.authserviceClientId must reference a protecting Authservice client in this Package";
    }
    if (
      !machine.clientId ||
      machine.clientId.includes("*") ||
      machine.publicClient ||
      machine.protocol === "saml" ||
      machine.enabled === false ||
      machine.clientAuthenticatorType === "client-jwt" ||
      machine.enableAuthserviceSelector ||
      !machine.serviceAccountsEnabled ||
      machine.standardFlowEnabled !== false ||
      !machine.protocolMappers?.some(
        m =>
          m.protocol === "openid-connect" &&
          m.protocolMapper === "oidc-audience-mapper" &&
          m.config?.["included.client.audience"] === browser.clientId &&
          m.config?.["access.token.claim"] === "true",
      )
    ) {
      return "Machine client must enable service accounts and include the browser client audience in access tokens";
    }
  }
}
