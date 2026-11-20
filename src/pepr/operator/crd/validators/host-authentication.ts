/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */
import { Expose, Gateway, UDSPackage } from "..";
import { getFqdn } from "../../controllers/domain-utils";

export function selectorsOverlap(a: Record<string, string>, b: Record<string, string>) {
  return Object.entries(a).every(([key, value]) => !(key in b) || b[key] === value);
}

export function validateHostAuthentication(pkg: UDSPackage, expose: Expose): string | undefined {
  const auth = expose.authentication;
  if (!auth) return;
  const hosts = pkg.spec?.network?.expose ?? [];
  const clients = pkg.spec?.sso ?? [];
  if (
    auth.mode !== "authservice" ||
    !expose.host ||
    !expose.service ||
    !expose.port ||
    !expose.selector ||
    !Object.keys(expose.selector).length ||
    (expose.gateway && expose.gateway !== Gateway.Tenant) ||
    expose.domain ||
    expose.host.includes("*") ||
    expose.protocol === "UDP" ||
    expose.advancedHTTP ||
    expose.match ||
    expose.uptime
  ) {
    return "Host authentication requires a tenant HTTP Service exposure without advanced routing or uptime checks";
  }
  const browser = clients.find(s => s.clientId === auth.ssoClientId);
  const machine = clients.find(s => s.clientId === auth.machineClientId);
  if (
    !browser ||
    !machine ||
    browser === machine ||
    browser.publicClient ||
    browser.protocol === "saml" ||
    browser.standardFlowEnabled === false ||
    browser.serviceAccountsEnabled ||
    !/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(browser.clientId) ||
    machine.clientId.includes("*")
  ) {
    return "Host authentication requires distinct browser and machine clients in this Package";
  }
  if (
    machine.publicClient ||
    machine.protocol === "saml" ||
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
  try {
    const uri = new URL(browser.redirectUris?.[0] ?? "");
    if (
      uri.origin !== `https://${getFqdn(expose)}` ||
      uri.username ||
      uri.password ||
      uri.search ||
      uri.hash ||
      uri.pathname === "/" ||
      uri.pathname === "/logout" ||
      uri.href.includes("*")
    )
      throw new Error();
  } catch {
    return "First browser redirect URI must be an exact HTTPS callback on the exposed host, distinct from / and /logout";
  }
  if (
    browser.enableAuthserviceSelector ||
    clients.some(
      s =>
        s.enableAuthserviceSelector &&
        selectorsOverlap(s.enableAuthserviceSelector, expose.selector!),
    ) ||
    hosts.some(
      other =>
        other !== expose &&
        (other.authentication?.ssoClientId === browser.clientId ||
          other.service === expose.service ||
          (other.selector && selectorsOverlap(other.selector, expose.selector!)) ||
          getFqdn(other) === getFqdn(expose)),
    )
  ) {
    return "Host authentication conflicts with another exposure or Authservice selector";
  }
}
