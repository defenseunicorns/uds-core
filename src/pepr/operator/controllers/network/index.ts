import { K8s, Log, kind } from "pepr";

import { Allow, Direction, Gateway, UDSPackage, getOwnerRef } from "../../crd";
import { allowEgressDNS } from "./allow-egress-dns";
import { allowEgressIstiod } from "./allow-egress-istiod";
import { allowIngressSidecarMonitoring } from "./allow-ingress-sidecar-monitoring";
import { defaultDenyAll } from "./default-deny-all";

// Import the NetworkPolicy transforms webhook
import { generate } from "./generate";

export async function networkPolicies(pkg: UDSPackage, namespace: string) {
  const customPolicies = pkg.spec?.network?.allow ?? [];

  // Get the current generation of the package
  const generation = (pkg.metadata?.generation ?? 0).toString();

  const policies = [
    // All traffic must be explicitly allowed
    defaultDenyAll(namespace),

    // Allow DNS lookups
    allowEgressDNS(namespace),

    // Istio rules
    allowEgressIstiod(namespace),
    allowIngressSidecarMonitoring(namespace),
  ];

  // Process custom policies
  for (const policy of customPolicies) {
    const generatedPolicy = await generate(namespace, pkg, policy);
    policies.push(generatedPolicy);
  }

  // Generate NetworkPolicies for any VirtualServices that are generated
  const exposeList = pkg.spec?.network?.expose ?? [];
  for (const expose of exposeList) {
    const { gateway = Gateway.Tenant, port, podLabels } = expose;

    // Create the NetworkPolicy for the VirtualService
    const policy: Allow = {
      direction: Direction.Ingress,
      podLabels,
      remotePodLabels: {
        app: `${gateway}-ingressgateway`,
      },
      remoteNamespaceLabels: {
        "kubernetes.io/metadata.name": `istio-${gateway}-gateway`,
      },
      port,
    };

    // Generate the policy with a base index of 1000
    const generatedPolicy = await generate(namespace, pkg, policy);
    policies.push(generatedPolicy);
  }

  // Iterate over each policy and apply it
  for (const [idx, policy] of policies.entries()) {
    // Add the package name and generation to the labels
    policy.metadata = policy.metadata ?? {};
    policy.metadata.labels = policy.metadata?.labels ?? {};
    policy.metadata.labels["uds/package"] = pkg.metadata!.name!;
    policy.metadata.labels["uds/generation"] = generation;

    // If not the default deny all policy, add the index to the name
    if (idx > 0) {
      policy.metadata.name = `allow-uds-${pkg.metadata!.name}-${idx}-${policy.metadata.name}`;
    }

    // Use the CR as the owner ref for each NetworkPolicy
    policy.metadata.ownerReferences = getOwnerRef(pkg);

    // Apply the NetworkPolicy and force overwrite any existing policy
    await K8s(kind.NetworkPolicy).Apply(policy, { force: true });
  }

  // Delete any policies that are no longer needed
  const policyList = await K8s(kind.NetworkPolicy)
    .InNamespace(namespace)
    .WithLabel("uds/package", pkg.metadata!.name!)
    .Get();

  // Find any orphaned polices (not matching the current generation)
  const orphanedNetPol = policyList.items.filter(
    netPol => netPol.metadata?.labels?.["uds/generation"] !== generation,
  );

  // Delete any orphaned policies
  for (const netPol of orphanedNetPol) {
    Log.debug(netPol, `Deleting orphaned VirtualService ${netPol.metadata!.name}`);
    await K8s(kind.NetworkPolicy).Delete(netPol);
  }

  // Return the list of policies
  return policies;
}
