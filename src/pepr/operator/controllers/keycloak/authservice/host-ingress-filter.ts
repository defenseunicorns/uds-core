/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */
import { Phase, TrafficExtension } from "../../../crd/generated/istio/trafficextension-v1alpha1";

export function buildIngressFilter(
  host: string,
  routeName: string,
): NonNullable<TrafficExtension["spec"]> {
  return {
    phase: Phase.Authn,
    lua: {
      inlineCode: `function envoy_on_request(handle)
  local authority = handle:headers():get(":authority")
  if authority and authority:lower():match("^([^:]+)") == ${JSON.stringify(host)} then
    handle:streamInfo():dynamicMetadata():set("uds.host_auth", ${JSON.stringify(routeName)}, true)
  end
end`,
    },
  };
}
