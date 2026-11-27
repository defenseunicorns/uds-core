/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */
import { Mode } from "../../../crd/generated/package-v1alpha1";
import { expect, it } from "vitest";
import { hostManifests } from "./host-manifests";
import { IstioAuthorizationPolicy, UDSPackage } from "../../../crd";
import { PROMETHEUS_PRINCIPAL } from "../../utils";

const expose = {
  host: "app",
  domain: "uds.dev",
  service: "web",
  port: 80,
  selector: { app: "web" },
};
const browser = { name: "browser", clientId: "browser", authservice: { exposeHost: "app" } };
const makePackage = (mode: Mode) => ({
  metadata: { name: "app", namespace: "app", uid: "uid", generation: 1 },
  spec: { network: { expose: [expose], serviceMesh: { mode } }, sso: [browser] },
});

// Evaluate the generated rule combinations against concrete traffic, including overlapping denials.
function denied(policy: IstioAuthorizationPolicy, attributes: Record<string, string | undefined>) {
  const matches = (values: string[], value: string | undefined) =>
    values.some(pattern =>
      pattern === "*"
        ? !!value
        : pattern.endsWith("*")
          ? value?.startsWith(pattern.slice(0, -1))
          : pattern === value,
    );
  return policy.spec!.rules!.some(
    rule =>
      (!rule.from ||
        rule.from.some(
          ({ source }) =>
            (!source?.principals || matches(source.principals, attributes["source.principal"])) &&
            (!source?.notPrincipals ||
              !matches(source.notPrincipals, attributes["source.principal"])),
        )) &&
      (!rule.to ||
        rule.to.some(({ operation }) =>
          (
            [
              ["hosts", "notHosts"],
              ["ports", "notPorts"],
              ["paths", "notPaths"],
            ] as const
          ).every(([key, negative]) => {
            const values = operation?.[key];
            const notValues = operation?.[negative];
            return (
              (!values || matches(values, attributes[key])) &&
              (!notValues || !matches(notValues, attributes[key]))
            );
          }),
        )) &&
      (!rule.when ||
        rule.when.every(
          condition =>
            (!condition.values || matches(condition.values, attributes[condition.key])) &&
            (!condition.notValues || !matches(condition.notValues, attributes[condition.key])),
        )),
  );
}

it.each([Mode.Ambient, Mode.Sidecar])(
  "allows only configured Prometheus scrapes without host credentials in %s",
  mode => {
    const pkg: UDSPackage = makePackage(mode);
    pkg.spec!.monitor = [
      { selector: expose.selector, portName: "http", targetPort: 80 },
      { selector: expose.selector, portName: "metrics", targetPort: 8080, path: "/custom" },
      { selector: { app: "other" }, portName: "metrics", targetPort: 80, path: "/other" },
    ];
    const resolved = { ...expose, selector: { ...expose.selector, component: "server" } };
    pkg.spec!.network!.expose = [resolved];
    const policy = hostManifests(pkg, resolved, browser, [], "namespace-uid").filter(
      r => r.kind === "AuthorizationPolicy",
    )[2];
    const scrape = {
      "source.principal": PROMETHEUS_PRINCIPAL,
      hosts: "10.0.0.1",
      ports: "80",
      paths: "/metrics",
    };
    expect(denied(policy, scrape)).toBe(false);
    expect(denied(policy, { ...scrape, ports: "8080", paths: "/custom" })).toBe(false);
    expect(denied(policy, { ...scrape, paths: "/custom" })).toBe(true);
    expect(denied(policy, { ...scrape, ports: "8080" })).toBe(true);
    expect(denied(policy, { ...scrape, paths: "/other" })).toBe(true);
    expect(denied(policy, { ...scrape, paths: "/headers" })).toBe(true);
    for (const source of [
      "cluster.local/ns/other/sa/client",
      "cluster.local/ns/istio-tenant-gateway/sa/tenant-ingressgateway",
    ]) {
      expect(denied(policy, { ...scrape, "source.principal": source })).toBe(true);
    }
    expect(denied(policy, { ...scrape, ports: "15020", paths: "/stats/prometheus" })).toBe(
      mode !== Mode.Sidecar,
    );
    expect(denied(policy, { ...scrape, paths: "/stats/prometheus" })).toBe(true);
  },
);

it.each([Mode.Ambient, Mode.Sidecar])(
  "still authenticates tenant requests to configured metrics in %s",
  mode => {
    const pkg: UDSPackage = makePackage(mode);
    pkg.spec!.monitor = [{ selector: expose.selector, portName: "http", targetPort: 80 }];
    const manifests = hostManifests(pkg, expose, browser, [], "namespace-uid");
    const authorization = manifests.filter(r => r.kind === "AuthorizationPolicy");
    const authentication = manifests.filter(r => r.kind === "RequestAuthentication");
    const request = {
      "source.principal": "cluster.local/ns/istio-tenant-gateway/sa/tenant-ingressgateway",
      hosts: "app.uds.dev",
      ports: "80",
      paths: "/metrics",
      "request.auth.claims[iss]": authentication[1].spec.jwtRules![0].issuer,
      "request.auth.audiences": browser.clientId,
      "request.auth.presenter": browser.clientId,
      "experimental.envoy.filters.http.lua[uds_authservice_channel]": "browser",
    };
    expect(denied(authorization[2], request)).toBe(false);
    expect(denied(authorization[2], { ...request, "request.auth.audiences": "wrong" })).toBe(true);
    expect(
      denied(authorization[2], {
        ...request,
        "experimental.envoy.filters.http.lua[uds_authservice_channel]": "",
      }),
    ).toBe(true);
  },
);

it.each([Mode.Ambient, Mode.Sidecar])("generates host authentication policies for %s", mode => {
  const manifests = hostManifests(makePackage(mode), expose, browser, [], "namespace-uid");
  const authentication = manifests.filter(r => r.kind === "RequestAuthentication");
  const authorization = manifests.filter(r => r.kind === "AuthorizationPolicy");

  expect(authentication[0].metadata.labels).toEqual({
    "uds/package": "app",
    "uds/generation": "1",
    "uds/for": "host-auth",
  });
  expect(authentication[0].spec.jwtRules).toHaveLength(1);
  expect(authentication[1].spec.jwtRules).toHaveLength(2);
  const actions = authorization.map(policy => policy.spec?.action);
  expect(actions).toEqual(["CUSTOM", "DENY", "DENY"]);
  const expectedTarget =
    mode === Mode.Ambient
      ? { targetRefs: [{ name: "browser-waypoint" }] }
      : { selector: { matchLabels: expose.selector } };
  expect(authentication[1].spec).toMatchObject(expectedTarget);
  expect(authorization[2].spec).toMatchObject(expectedTarget);
});

it.each([
  [Mode.Ambient, 8080, [{ mode: "SERVER" }]],
  [Mode.Sidecar, undefined, [{ mode: "SERVER", ports: [{ number: 80 }] }]],
  [Mode.Sidecar, 8080, [{ mode: "SERVER", ports: [{ number: 8080 }] }]],
] as const)("builds %s filters with targetPort %s", (mode, targetPort, expectedMatch) => {
  const target = { ...expose, targetPort };
  const pkg = {
    metadata: { name: "app", namespace: "app", uid: "uid", generation: 1 },
    spec: { network: { expose: [target], serviceMesh: { mode } }, sso: [browser] },
  };
  const [classifier, , , workload, , , ingressHost] = hostManifests(
    pkg,
    target,
    browser,
    [],
    "namespace-uid",
  );

  expect(classifier.spec?.phase).toBe("AUTHN");
  expect(classifier.spec?.match).toEqual(expectedMatch);
  expect(ingressHost.metadata?.namespace).toBe("istio-tenant-gateway");
  expect(classifier.spec).toMatchObject(
    mode === Mode.Sidecar
      ? { selector: { matchLabels: target.selector } }
      : { targetRefs: workload.spec.targetRefs },
  );
});
