import { K8s, Log, kind } from "pepr";

import { DisableDefault, UDSPackage } from "../crd";
import { allowEgressDNS } from "./allow-egress-dns";
import { allowEgressIstiod } from "./allow-egress-istiod";
import { allowEgressWithinNS } from "./allow-egress-within-ns";
import { allowIngressSidecarMonitoring } from "./allow-ingress-sidecar-monitoring";
import { allowIngressWithinNS } from "./allow-ingress-within-ns";
import { defaultDenyAll } from "./default-deny-all";

// Import the NetworkPolicy transforms webhook
import { builder } from "./builder";

export async function networkPolicies(pkg: UDSPackage, namespace: string) {
  const disabled = pkg.spec?.network?.policies?.disableDefaults ?? [];
  const customPolicies = pkg.spec?.network?.policies?.allow ?? [];

  // Get the current generation of the package
  const generation = (pkg.metadata?.generation ?? 0).toString();

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
  for (const [idx, policy] of customPolicies.entries()) {
    const generatedPolicy = await builder(namespace, pkg, policy, generation, idx);
    policies.push(generatedPolicy);
  }

  // Apply each policy, overwriting any existing policy
  for (const policy of policies) {
    await K8s(kind.NetworkPolicy).Apply(policy);
  }

  // Delete any policies that are no longer needed
  const policyList = await K8s(kind.NetworkPolicy)
    .InNamespace(namespace)
    .WithLabel("uds/package", pkg.metadata!.name!)
    .Get();

  // Find any orphaned polices (not matching the current generation)
  const orphanedNetPol = policyList.items.filter(
    vs => vs.metadata?.labels?.["uds/generation"] !== generation,
  );

  // Delete any orphaned policies
  for (const vs of orphanedNetPol) {
    Log.debug(vs, `Deleting orphaned VirtualService ${vs.metadata!.name}`);
    await K8s(kind.NetworkPolicy).Delete(vs);
  }
}
