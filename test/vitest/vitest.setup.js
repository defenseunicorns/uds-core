/**
 * Copyright 2025-2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s, kind } from "pepr";

export async function setup(project) {
  // The root project owns the shared namespace. Child projects inherit this
  // setup, but must not create or delete the namespace independently.
  if (!project.isRootProject()) return;

  await K8s(kind.Namespace).Apply({
    metadata: {
      name: "policy-tests",
      labels: {
        "istio-injection": "disabled",
        "zarf.dev/agent": "ignore",
      },
    },
  });

  return async () => {
    await K8s(kind.Namespace).Delete("policy-tests");
  };
}
