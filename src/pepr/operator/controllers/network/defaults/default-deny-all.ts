/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { kind } from "pepr";
// @lulaStart cd540e07-153b-424c-90e0-c0daec56b16a
// @lulaStart cd540e07-153b-424c-90e0-c0daec56b18f
export function defaultDenyAll(namespace: string): kind.NetworkPolicy {
  return {
    apiVersion: "networking.k8s.io/v1",
    kind: "NetworkPolicy",
    metadata: {
      name: "default",
      namespace,
    },
    spec: {
      podSelector: {},
      policyTypes: ["Ingress", "Egress"],
      ingress: [],
      egress: [],
    },
  };
}
// @lulaEnd cd540e07-153b-424c-90e0-c0daec56b18f
// @lulaEnd cd540e07-153b-424c-90e0-c0daec56b16a
