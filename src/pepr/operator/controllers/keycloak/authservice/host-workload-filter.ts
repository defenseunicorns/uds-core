/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */
import {
  TrafficExtension,
  Mode,
  Phase,
} from "../../../crd/generated/istio/trafficextension-v1alpha1";
import { browserHeader, machineHeader } from "./host-authentication-policies";

export function buildWorkloadFilter(
  isSidecar: boolean,
  port: number,
): NonNullable<TrafficExtension["spec"]> {
  return {
    match: [
      {
        mode: Mode.Server,
        ...(isSidecar && { ports: [{ number: port }] }),
      },
    ],
    phase: Phase.Authn,
    lua: {
      inlineCode: `function envoy_on_request(handle)
  local headers = handle:headers()
  local machine = headers:getNumValues("${machineHeader}")
  local browser = headers:getNumValues("${browserHeader}")
  -- AuthorizationPolicy permits tokenless scrapes only for Prometheus on configured endpoints.
  if machine + browser > 1 then
    handle:respond({[":status"] = "401"}, "")
  elseif machine + browser == 1 then
    handle:streamInfo():dynamicMetadata():set("envoy.filters.http.lua", "uds_authservice_channel", machine == 1 and "machine" or "browser")
  end
end`,
    },
  };
}
