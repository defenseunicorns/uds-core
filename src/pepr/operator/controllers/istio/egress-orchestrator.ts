/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { UDSPackage } from "../../crd";
import { Mode } from "../../crd/generated/package-v1alpha1";
import { getOwnerRef, validateNamespace } from "../utils";
import {
  createHostResourceMap,
  egressRequestedFromNetwork,
  reconcileSharedEgressResources,
} from "./egress";
import { createSidecarWorkloadEgressResources, validateEgressGateway } from "./egress-sidecar";
import { ambientEgressNamespace, log } from "./istio-resources";
import { PackageAction } from "./types";

// Creates ServiceEntry/Sidecar for egress and reconciles shared egress resources
export async function istioEgressResources(pkg: UDSPackage, namespace: string) {
  const istioMode = pkg.spec?.network?.serviceMesh?.mode || Mode.Ambient;
  const pkgId = `${pkg.metadata?.name}-${pkg.metadata?.namespace}`;
  const pkgName = pkg.metadata!.name!;
  const generation = (pkg.metadata?.generation ?? 0).toString();
  const ownerRefs = getOwnerRef(pkg);

  // Get the map of host resources as egress endpoints
  const hostResourceMap = createHostResourceMap(pkg);

  // Get the list of allowed egress services
  const allowList = egressRequestedFromNetwork(pkg.spec?.network?.allow ?? []);

  // Add needed service entries and sidecars if egress is requested
  if (hostResourceMap) {
    if (istioMode === Mode.Ambient) {
      // Validate existing egress waypoint namespace
      try {
        await validateNamespace(ambientEgressNamespace);
      } catch (e: unknown) {
        let errText = `Unable to get the egress waypoint namespace ${ambientEgressNamespace}.`;
        const status = (e as { status?: number } | undefined)?.status;
        if (status === 404) {
          errText = `The '${ambientEgressNamespace}' namespace was not found. Ensure the 'istio-egress-ambient' component is deployed and try again.`;
        }
        log.error(errText);
        throw new Error(errText);
      }
    } else {
      // Validate existing egress gateway namespace and service
      await validateEgressGateway(hostResourceMap);

      // Create sidecar and service entry resources
      await createSidecarWorkloadEgressResources(
        hostResourceMap,
        allowList,
        pkgName,
        namespace,
        generation,
        ownerRefs,
      );
    }
  }

  // Reconcile shared egress resources
  try {
    await reconcileSharedEgressResources(
      pkg,
      hostResourceMap,
      PackageAction.AddOrUpdate,
      istioMode,
    );
  } catch (e) {
    log.error(`Failed to reconcile shared egress resources for package ${pkgId}`, e);
    throw e;
  }
}
