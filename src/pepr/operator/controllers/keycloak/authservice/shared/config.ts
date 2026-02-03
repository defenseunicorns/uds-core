/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { UDSConfig } from "../../../config/config";
import { AuthserviceOperatorConfig } from "./interfaces";
import { setAuthserviceOperatorConfig } from "./registry";

let operatorConfig: AuthserviceOperatorConfig;

export function initializeOperatorConfig() {
  operatorConfig = {
    namespace: "authservice",
    secretName: "authservice-uds",
    baseDomain: `https://sso.${UDSConfig.domain}`,
    realm: "uds",
  };

  // Register the operator config
  setAuthserviceOperatorConfig(operatorConfig);
}

export { operatorConfig };
