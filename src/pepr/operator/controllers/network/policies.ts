import { K8s, Log, kind } from "pepr";

import { Allow, Direction, Gateway, UDSPackage } from "../../crd";
import { getOwnerRef } from "../utils";
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

  Log.debug(pkg.metadata, `Generating NetworkPolicies for generation ${generation}`);

  // Generate the default policies
  const policies = [
    // All traffic must be explicitly allowed
    defaultDenyAll(namespace),

    // Allow DNS lookups
    allowEgressDNS(namespace),

    // Istio rules
    allowEgressIstiod(namespace),
    allowIngressSidecarMonitoring(namespace),
  ];

  // Map of originally generated policy names to watch for duplicates.
  // Duplicates will have their ports added to their names
  // <originalPolicyName, nameIfHitWithDuplicate>
  const originallyGeneratedPolicyNames = new Map<string, string>();

  // Process custom policies
  for (const policy of customPolicies) {
    const generatedPolicy = generate(namespace, policy);

    const policyPorts = policy.port
      ? policy.port.toString()
      : policy.ports
        ? policy.ports.sort().join("-")
        : "";
    handleDuplicatePolicyNames(
      generatedPolicy,
      policyPorts,
      originallyGeneratedPolicyNames,
      policies,
    );
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
    handleDuplicatePolicyNames(
      generatedPolicy,
      policy.port!.toString(),
      originallyGeneratedPolicyNames,
      policies,
    );
    policies.push(generatedPolicy);
  }

  // Generate NetworkPolicies for any ServiceMonitors that are generated
  const monitorList = pkg.spec?.monitor ?? [];
  // Iterate over each ServiceMonitor
  for (const monitor of monitorList) {
    const { selector, targetPort, podSelector } = monitor;

    // Create the NetworkPolicy for the ServiceMonitor
    const policy: Allow = {
      direction: Direction.Ingress,
      selector: podSelector ?? selector,
      remoteNamespace: "monitoring",
      remoteSelector: {
        app: "prometheus",
      },
      port: targetPort,
      description: `${Object.values(selector)} Metrics`,
    };
    // Generate the policy
    const generatedPolicy = generate(namespace, policy);
    handleDuplicatePolicyNames(
      generatedPolicy,
      policy.port!.toString(),
      originallyGeneratedPolicyNames,
      policies,
    );
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
/**
 * Handle duplicate policy names by adding the ports to the name to avoid unwanted duplicates
 * @param generatedPolicy the generated policy to check for duplicates
 * @param policyPorts the ports of the policy
 * @param originallyGeneratedPolicyNames the map of originally generated policy names to watch for duplicates
 * @param policies the list of policies ready to be applied
 */
function handleDuplicatePolicyNames(
  generatedPolicy: kind.NetworkPolicy,
  policyPorts: string,
  originallyGeneratedPolicyNames: Map<string, string>,
  policies: kind.NetworkPolicy[],
) {
  if (originallyGeneratedPolicyNames.has(generatedPolicy.metadata!.name!)) {
    // take care of original policy first
    const originalPolicy = policies.find(p => p.metadata!.name === generatedPolicy.metadata!.name);

    if (originalPolicy) {
      // replace original policy name with the name that would have been used if it was a duplicate
      originalPolicy!.metadata!.name = originallyGeneratedPolicyNames.get(
        generatedPolicy.metadata!.name!,
      );
    }

    // take care of generated one now
    // add port to the name to generated name to avoid unwanted duplicates
    generatedPolicy.metadata!.name = `${policyPorts}-${generatedPolicy.metadata!.name}`;
  } else {
    // Save off potential name if original gets a hit on a duplicate check later
    const potentialName = `${policyPorts}-${generatedPolicy.metadata!.name}`;
    originallyGeneratedPolicyNames.set(generatedPolicy.metadata!.name!, potentialName);
  }
}
