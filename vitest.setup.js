/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s, kind } from 'pepr';

export async function setup() {
  await K8s(kind.Namespace).Apply({
    metadata: {
      name: "policy-tests",
      labels: {
        "istio-injection": "disabled",
        "zarf.dev/agent": "ignore",
      },
    },
  });
}

export async function teardown() {
  await K8s(kind.Namespace).Delete("policy-tests");
}
