/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { execFileSync } from "node:child_process";
import * as k8s from "@kubernetes/client-node";
import { describe, expect, test } from "vitest";

const GATEWAY_API_RESOURCES = [
  {
    group: "apiextensions.k8s.io",
    version: "v1",
    plural: "customresourcedefinitions",
    name: "backendtlspolicies.gateway.networking.k8s.io",
  },
  {
    group: "apiextensions.k8s.io",
    version: "v1",
    plural: "customresourcedefinitions",
    name: "gatewayclasses.gateway.networking.k8s.io",
  },
  {
    group: "apiextensions.k8s.io",
    version: "v1",
    plural: "customresourcedefinitions",
    name: "gateways.gateway.networking.k8s.io",
  },
  {
    group: "apiextensions.k8s.io",
    version: "v1",
    plural: "customresourcedefinitions",
    name: "grpcroutes.gateway.networking.k8s.io",
  },
  {
    group: "apiextensions.k8s.io",
    version: "v1",
    plural: "customresourcedefinitions",
    name: "httproutes.gateway.networking.k8s.io",
  },
  {
    group: "apiextensions.k8s.io",
    version: "v1",
    plural: "customresourcedefinitions",
    name: "listenersets.gateway.networking.k8s.io",
  },
  {
    group: "apiextensions.k8s.io",
    version: "v1",
    plural: "customresourcedefinitions",
    name: "referencegrants.gateway.networking.k8s.io",
  },
  {
    group: "apiextensions.k8s.io",
    version: "v1",
    plural: "customresourcedefinitions",
    name: "tcproutes.gateway.networking.k8s.io",
  },
  {
    group: "apiextensions.k8s.io",
    version: "v1",
    plural: "customresourcedefinitions",
    name: "tlsroutes.gateway.networking.k8s.io",
  },
  {
    group: "apiextensions.k8s.io",
    version: "v1",
    plural: "customresourcedefinitions",
    name: "udproutes.gateway.networking.k8s.io",
  },
  {
    group: "apiextensions.k8s.io",
    version: "v1",
    plural: "customresourcedefinitions",
    name: "xbackends.gateway.networking.x-k8s.io",
  },
  {
    group: "apiextensions.k8s.io",
    version: "v1",
    plural: "customresourcedefinitions",
    name: "xbackendtrafficpolicies.gateway.networking.x-k8s.io",
  },
  {
    group: "apiextensions.k8s.io",
    version: "v1",
    plural: "customresourcedefinitions",
    name: "xmeshes.gateway.networking.x-k8s.io",
  },
  {
    group: "admissionregistration.k8s.io",
    version: "v1",
    plural: "validatingadmissionpolicies",
    name: "safe-upgrades.gateway.networking.k8s.io",
  },
  {
    group: "admissionregistration.k8s.io",
    version: "v1",
    plural: "validatingadmissionpolicybindings",
    name: "safe-upgrades.gateway.networking.k8s.io",
  },
];

const GATEWAY_API_RELEASE_NAME = "gateway-api-crds";
const GATEWAY_API_RELEASE_NAMESPACE = "default";
const LEGACY_GATEWAY_API_CHART_PATTERN = /^raw-.*-gateway-api-crds-gateway-api-crds-/;

const kc = new k8s.KubeConfig();
kc.loadFromDefault();

const customObjects = kc.makeApiClient(k8s.CustomObjectsApi);

type HelmRelease = {
  name: string;
  namespace: string;
  chart: string;
};

function listDefaultNamespaceHelmReleases(): HelmRelease[] {
  const output = execFileSync(
    "uds",
    [
      "zarf",
      "tools",
      "helm",
      "list",
      "--namespace",
      GATEWAY_API_RELEASE_NAMESPACE,
      "--output",
      "json",
    ],
    { encoding: "utf8" },
  );

  return JSON.parse(output) as HelmRelease[];
}

describe("Gateway API resources", () => {
  test("are owned by the stable Helm release", async () => {
    for (const resourceRef of GATEWAY_API_RESOURCES) {
      const resource = (await customObjects.getClusterCustomObject(
        resourceRef,
      )) as k8s.KubernetesObject;

      expect(resource.metadata?.labels?.["app.kubernetes.io/managed-by"]).toBe("Helm");
      expect(resource.metadata?.annotations?.["meta.helm.sh/release-name"]).toBe(
        GATEWAY_API_RELEASE_NAME,
      );
      expect(resource.metadata?.annotations?.["meta.helm.sh/release-namespace"]).toBe(
        GATEWAY_API_RELEASE_NAMESPACE,
      );
    }
  });

  test("does not leave the legacy Zarf manifest Helm release behind", () => {
    const legacyReleases = listDefaultNamespaceHelmReleases().filter(release =>
      LEGACY_GATEWAY_API_CHART_PATTERN.test(release.chart),
    );

    expect(legacyReleases).toEqual([]);
  });
});
