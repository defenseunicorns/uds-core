import { K8s, kind } from "pepr";

import { DisableDefault, UDSPackage } from "../crd";
import { allowEgressDNS } from "./allow-egress-dns";
import { allowEgressIstiod } from "./allow-egress-istiod";
import { allowEgressWithinNS } from "./allow-egress-within-ns";
import { allowIngressSidecarMonitoring } from "./allow-ingress-sidecar-monitoring";
import { allowIngressWithinNS } from "./allow-ingress-within-ns";
import { defaultDenyAll } from "./default-deny-all";

// Import the NetworkPolicy transforms webhook
import "./transforms";
import { builder } from "./builder";

export async function networkPolicies(pkg: UDSPackage, namespace: string) {
  const disabled = pkg.spec?.network?.policies?.disableDefaults ?? [];
  const customPolicies = pkg.spec?.network?.policies?.allow ?? [];

  const policies = [
    // All traffic must be explicitly allowed
    defaultDenyAll(namespace),
    // Istio rules
    allowEgressIstiod(namespace),
    allowIngressSidecarMonitoring(namespace),
  ];

  // Allow DNS lookups
  if (!disabled.includes(DisableDefault.DNSLookup)) {
    policies.push(allowEgressDNS(namespace));
  }

  // Allow all traffic within the namespace
  if (!disabled.includes(DisableDefault.PermissiveNamespace)) {
    policies.push(allowEgressWithinNS(namespace));
    policies.push(allowIngressWithinNS(namespace));
  }

  // Process custom policies
  for (const policy of customPolicies) {
    policies.push(builder(namespace, pkg, policy));
  }

  for (const policy of policies) {
    // Apply the policy, overwriting any existing policy
    await K8s(kind.NetworkPolicy).Apply(policy);
  }
}
