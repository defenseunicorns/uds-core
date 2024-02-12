import { K8s, Log, kind } from "pepr";

import { Allow, Direction, Gateway, UDSPackage, getOwnerRef } from "../../crd";
import { sanitizeResourceName } from "../utils";
import { allowEgressDNS } from "./defaults/allow-egress-dns";
import { allowEgressIstiod } from "./defaults/allow-egress-istiod";
import { allowIngressSidecarMonitoring } from "./defaults/allow-ingress-sidecar-monitoring";
import { defaultDenyAll } from "./defaults/default-deny-all";
import { generate } from "./generate";

export async function networkPolicies(pkg: UDSPackage, namespace: string) {
  const customPolicies = pkg.spec?.network?.allow ?? [];
  const pkgName = pkg.metadata!.name!;

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
    const generatedPolicy = generate(namespace, policy);
    policies.push(generatedPolicy);
  }

  // Generate NetworkPolicies for any VirtualServices that are generated
  const exposeList = pkg.spec?.network?.expose ?? [];
  // Iterate over each exposed service, excluding directResponse services
  for (const expose of exposeList.filter(exp => !exp.advancedHTTP?.directResponse)) {
    const { gateway = Gateway.Tenant, port, selector = {}, targetPort } = expose;

    // Create the NetworkPolicy for the VirtualService
    const policy: Allow = {
      direction: Direction.Ingress,
      selector,
      remoteNamespace: `istio-${gateway}-gateway`,
      remoteSelector: {
        app: `${gateway}-ingressgateway`,
      },
      // Use the same port as the VirtualService if targetPort is not set
      port: targetPort ?? port,
      description: `${Object.values(selector)} Istio ${gateway} gateway`,
    };

    // Generate the policy
    const generatedPolicy = generate(namespace, policy);
    policies.push(generatedPolicy);
  }

  // Iterate over each policy and apply it
  for (const [idx, policy] of policies.entries()) {
    // Add the package name and generation to the labels
    policy.metadata = policy.metadata ?? {};
    policy.metadata.labels = policy.metadata?.labels ?? {};
    policy.metadata.labels["uds/package"] = pkgName;
    policy.metadata.labels["uds/generation"] = generation;

    // Add the package name to the name of the policy to ensure uniqueness
    if (idx < 1) {
      policy.metadata.name = `deny-${pkgName}-${policy.metadata.name}`;
    } else {
      policy.metadata.name = `allow-${pkgName}-${policy.metadata.name}`;
    }

    // Ensure the name is a valid resource name
    policy.metadata.name = sanitizeResourceName(policy.metadata.name);

    // Use the CR as the owner ref for each NetworkPolicy
    policy.metadata.ownerReferences = getOwnerRef(pkg);

    // Apply the NetworkPolicy and force overwrite any existing policy
    await K8s(kind.NetworkPolicy).Apply(policy, { force: true });
  }

  // Delete any policies that are no longer needed
  const policyList = await K8s(kind.NetworkPolicy)
    .InNamespace(namespace)
    .WithLabel("uds/package", pkgName)
    .Get();

  // Find any orphaned polices (not matching the current generation)
  const orphanedNetPol = policyList.items.filter(
    netPol => netPol.metadata?.labels?.["uds/generation"] !== generation,
  );

  // Delete any orphaned policies
  for (const netPol of orphanedNetPol) {
    Log.debug(netPol, `Deleting orphaned NetworkPolicy ${netPol.metadata!.name}`);
    await K8s(kind.NetworkPolicy).Delete(netPol);
  }

  // Return the list of policies
  return policies;
}
