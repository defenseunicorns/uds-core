/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */
import { K8s, kind } from "pepr";
import {
  Expose,
  IstioAction,
  IstioAuthorizationPolicy,
  IstioRequestAuthentication,
  UDSPackage,
} from "../../../crd";
import { Mode } from "../../../crd/generated/package-v1alpha1";
import {
  selectorsOverlap,
  validateHostAuthentication,
} from "../../../crd/validators/host-authentication";
import { UDSConfig } from "../../config/config";
import { deleteResourceIfUnchanged, getOwnerRef } from "../../utils";
import { getFqdn } from "../../domain-utils";
import { serviceAccountSubject } from "../clients/client-credentials";

const gatewayNamespace = "istio-tenant-gateway";
const gatewaySelector = { selector: { matchLabels: { app: "tenant-ingressgateway" } } };
const machineHeader = "x-uds-machine-token";
const browserHeader = "x-uds-authservice-token";

export async function resolveHostSelectors(pkg: UDSPackage) {
  const exposures = pkg.spec?.network?.expose ?? [];
  if (!exposures.some(e => e.authentication)) return;
  const services = await K8s(kind.Service).InNamespace(pkg.metadata!.namespace!).Get();
  for (const expose of exposures.filter(e => e.authentication)) {
    const error = validateHostAuthentication(pkg, expose);
    if (error) throw new Error(error);
    const selector = services.items.find(s => s.metadata?.name === expose.service)?.spec?.selector;
    if (!selector || !Object.keys(selector).length)
      throw new Error(`Missing Service selector for ${expose.service}`);
    for (const other of exposures.filter(e => e !== expose && e.service)) {
      const otherSelector = services.items.find(s => s.metadata?.name === other.service)?.spec
        ?.selector;
      if (!otherSelector || selectorsOverlap(selector, otherSelector))
        throw new Error(`Cannot isolate ${expose.service} from ${other.service}`);
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

export function hostPolicies(
  pkg: UDSPackage,
  expose: Expose,
  subject: string,
  namespaceUid: string,
) {
  const { ssoClientId, machineClientId } = expose.authentication!;
  const namespace = pkg.metadata!.namespace!;
  const host = getFqdn(expose);
  const issuer = `https://sso.${UDSConfig.domain}/realms/uds`;
  const hosts = [host, `${host}:*`];
  const to = [{ operation: { hosts } }];
  const id = `${pkg.metadata!.uid}-${pkg.metadata!.generation}-${pkg.spec!.network!.expose!.indexOf(expose)}`;
  const labels = {
    "uds.dev/host-auth-package": pkg.metadata!.uid!,
    "uds.dev/host-auth-generation": String(pkg.metadata!.generation),
  };
  const metadata = (suffix: string, ns: string) => ({
    name: `host-auth-${id}-${suffix}`,
    namespace: ns,
    ownerReferences:
      ns === gatewayNamespace
        ? [{ apiVersion: "v1", kind: "Namespace", name: namespace, uid: namespaceUid }]
        : getOwnerRef(pkg),
    labels,
  });
  const target =
    pkg.spec?.network?.serviceMesh?.mode === Mode.Sidecar
      ? { selector: { matchLabels: expose.selector! } }
      : { targetRefs: [{ group: "", kind: "Service", name: expose.service! }] };
  const machinePresenter = "request.headers[x-uds-machine-presenter]";
  const machine = { key: `request.headers[${machineHeader}]`, values: ["*"] };
  const jwt = { issuer, jwksUri: `${issuer}/protocol/openid-connect/certs` };
  const wrongIssuer = { key: "request.auth.claims[iss]", notValues: [issuer] };
  const wrongAudience = { key: "request.auth.audiences", notValues: [ssoClientId] };
  const wrongPresenter = { key: "request.auth.presenter", notValues: [machineClientId] };
  const wrongSubject = { key: "request.auth.claims[sub]", notValues: [subject] };
  const claims = [wrongIssuer, wrongAudience, wrongPresenter, wrongSubject];
  const authorization: IstioAuthorizationPolicy[] = [
    {
      metadata: metadata("browser", gatewayNamespace),
      spec: {
        ...gatewaySelector,
        action: IstioAction.Custom,
        provider: { name: "authservice" },
        rules: [{ to, when: [{ key: machine.key, notValues: ["*"] }] }],
      },
    },
    {
      metadata: metadata("ingress", gatewayNamespace),
      spec: {
        ...gatewaySelector,
        action: IstioAction.Deny,
        rules: claims.map(claim => ({ to, when: [machine, claim] })),
      },
    },
    {
      metadata: metadata("workload", namespace),
      spec: {
        ...target,
        action: IstioAction.Deny,
        rules: [
          { to: [{ operation: { notHosts: hosts } }] },
          {
            from: [
              {
                source: {
                  notPrincipals: ["cluster.local/ns/istio-tenant-gateway/sa/tenant-ingressgateway"],
                },
              },
            ],
          },
          { when: [wrongAudience] },
          { when: [wrongIssuer] },
          {
            when: [
              { key: machinePresenter, notValues: ["*"] },
              { key: "request.auth.presenter", notValues: [ssoClientId] },
            ],
          },
          { when: [{ key: machinePresenter, values: ["*"] }, wrongPresenter] },
          { when: [{ key: machinePresenter, values: ["*"] }, wrongSubject] },
        ],
      },
    },
  ];
  const authentication: IstioRequestAuthentication = {
    metadata: metadata("workload", namespace),
    spec: {
      ...target,
      jwtRules: [
        {
          ...jwt,
          audiences: [ssoClientId],
          fromHeaders: [{ name: browserHeader, prefix: "Bearer " }],
          forwardOriginalToken: false,
        },
        {
          ...jwt,
          audiences: [ssoClientId],
          fromHeaders: [{ name: machineHeader, prefix: "Bearer " }],
          // JWT validation removes the input header before authorization evaluates the claims.
          outputClaimToHeaders: [{ header: "x-uds-machine-presenter", claim: "azp" }],
          forwardOriginalToken: false,
        },
      ],
    },
  };
  const ingressAuthentication: IstioRequestAuthentication = {
    metadata: metadata("ingress", gatewayNamespace),
    spec: {
      ...gatewaySelector,
      jwtRules: [
        {
          ...jwt,
          fromHeaders: [{ name: machineHeader, prefix: "Bearer " }],
          forwardOriginalToken: true,
        },
      ],
    },
  };
  return { authentication, ingressAuthentication, authorization };
}

export async function applyHostPolicies(pkg: UDSPackage) {
  const exposures = pkg.spec?.network?.expose?.filter(e => e.authentication);
  if (!exposures?.length) return;
  // A cluster-scoped Namespace can own policies on the shared gateway.
  const ns = await K8s(kind.Namespace).Get(pkg.metadata!.namespace!);
  for (const expose of exposures) {
    const subject = await serviceAccountSubject(expose.authentication!.machineClientId);
    const { authentication, ingressAuthentication, authorization } = hostPolicies(
      pkg,
      expose,
      subject,
      ns.metadata!.uid!,
    );
    for (const policy of authorization)
      await K8s(IstioAuthorizationPolicy).Apply(policy, { force: true });
    await K8s(IstioRequestAuthentication).Apply(ingressAuthentication, { force: true });
    await K8s(IstioRequestAuthentication).Apply(authentication, { force: true });
  }
}

export async function purgeHostPolicies(pkg: UDSPackage, deleting = false) {
  for (const namespace of [gatewayNamespace, pkg.metadata!.namespace!]) {
    for (const type of [IstioAuthorizationPolicy, IstioRequestAuthentication]) {
      const query = K8s(type)
        .InNamespace(namespace)
        .WithLabel("uds.dev/host-auth-package", pkg.metadata!.uid!);
      const policies = await query.Get();
      for (const policy of policies.items) {
        if (
          deleting ||
          policy.metadata?.labels?.["uds.dev/host-auth-generation"] !==
            String(pkg.metadata!.generation)
        ) {
          await deleteResourceIfUnchanged(policy);
        }
      }
    }
  }
}
