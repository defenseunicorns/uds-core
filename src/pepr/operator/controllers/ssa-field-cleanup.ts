/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { V1ManagedFieldsEntry } from "@kubernetes/client-node";
import { K8s } from "pepr";

// Hardcoded in kubernetes-fluent-client (not exported); must match the value set via
// url.searchParams.set("fieldManager", "pepr") in that library's Apply implementation.
export const PEPR_FIELD_MANAGER = "pepr";

/**
 * Remove Pepr's SSA Apply entry from managedFields via JSON Patch.
 * Fields previously claimed by Pepr become unmanaged and persist in the live object.
 * The sparse Apply that follows re-establishes ownership of only the correct fields.
 *
 * Uses a `test` + `remove` pair: if the managedFields array has shifted between our GET and this
 * PATCH, the `test` fails atomically and the error is thrown — callers must not proceed with a
 * sparse Apply on failure, as SSA would release the old over-claimed fields and could drop data.
 *
 * @param resourceKind The Kubernetes kind class for the resource
 * @param name The name of the resource
 * @param namespace The namespace of the resource, or undefined for cluster-scoped resources
 * @param managedFields The current managedFields array from the resource's metadata — passed in
 *   by the caller (who already holds the fetched object) to avoid a redundant GET
 */
export async function removePeprManagedFieldsEntry(
  resourceKind: Parameters<typeof K8s>[0],
  name: string,
  namespace: string | undefined,
  managedFields: V1ManagedFieldsEntry[],
): Promise<void> {
  const idx = managedFields.findIndex(
    e => e.manager === PEPR_FIELD_MANAGER && e.operation === "Apply",
  );
  if (idx < 0) return;

  // Throws on failure — callers must not proceed with a sparse Apply if this fails,
  // because SSA would release previously over-claimed fields and could drop live data.
  await K8s(resourceKind, { name, namespace }).Patch([
    { op: "test", path: `/metadata/managedFields/${idx}/manager`, value: PEPR_FIELD_MANAGER },
    { op: "test", path: `/metadata/managedFields/${idx}/operation`, value: "Apply" },
    { op: "remove", path: `/metadata/managedFields/${idx}` },
  ]);
}
