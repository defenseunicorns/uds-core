/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { V1ManagedFieldsEntry } from "@kubernetes/client-node";
import { K8s } from "pepr";
import { Logger } from "pino";

// Hardcoded in kubernetes-fluent-client (not exported); must match the value set via
// url.searchParams.set("fieldManager", "pepr") in that library's Apply implementation.
export const PEPR_FIELD_MANAGER = "pepr";

/**
 * Remove Pepr's SSA Apply entry from managedFields via JSON Patch.
 * Fields previously claimed by Pepr become unmanaged and persist in the live object.
 * The sparse Apply that follows re-establishes ownership of only the correct fields.
 *
 * Uses a `test` + `remove` pair: if the managedFields array has shifted between our GET and this
 * PATCH, the `test` fails atomically and we log + continue rather than removing the wrong entry.
 */
export async function removePeprManagedFieldsEntry(
  resourceKind: Parameters<typeof K8s>[0],
  name: string,
  namespace: string | undefined,
  managedFields: V1ManagedFieldsEntry[],
  log: Logger,
): Promise<void> {
  const idx = managedFields.findIndex(
    e => e.manager === PEPR_FIELD_MANAGER && e.operation === "Apply",
  );
  if (idx < 0) return;

  try {
    await K8s(resourceKind, { name, namespace }).Patch([
      { op: "test", path: `/metadata/managedFields/${idx}/manager`, value: PEPR_FIELD_MANAGER },
      { op: "remove", path: `/metadata/managedFields/${idx}` },
    ]);
  } catch (err) {
    log.warn({ err }, `Could not strip stale Pepr managedFields entry for ${name}; proceeding`);
  }
}
