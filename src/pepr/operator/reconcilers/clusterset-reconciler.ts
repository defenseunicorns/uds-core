/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s } from "pepr";
import { Component, setupLogger } from "../../logger";
import { ClusterSet, ClusterSetPhase } from "../crd";

const log = setupLogger(Component.OPERATOR_RECONCILERS);

/**
 * Reconciles a ClusterSet by marking it Ready.
 *
 * NOTE: this is the minimal lifecycle reconciler. Per-cluster status
 * aggregation (service counts, member readiness) is a later task.
 *
 * @param cs the ClusterSet to reconcile
 */
export async function clusterSetReconciler(cs: ClusterSet) {
  const name = cs.metadata!.name;
  log.info(`Processing ClusterSet ${name}, phase: ${cs.status?.phase}`);

  await K8s(ClusterSet).PatchStatus({
    metadata: { name },
    status: {
      phase: ClusterSetPhase.Ready,
      observedGeneration: cs.metadata!.generation,
    },
  });
}
