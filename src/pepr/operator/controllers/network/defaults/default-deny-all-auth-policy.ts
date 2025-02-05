/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { IstioAuthorizationPolicy } from "../../../crd";

export function defaultDenyAllAuthPolicy(namespace: string): IstioAuthorizationPolicy {
  return {
    kind: "AuthorizationPolicy",
    metadata: {
      name: "default-deny-all",
      namespace,
    },
    spec: {},
  };
}