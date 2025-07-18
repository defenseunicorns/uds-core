/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { PeprValidateRequest } from "pepr";
import { isBase64 } from "../../controllers/utils";
import { ClusterConfig } from "../generated/clusterconfig-v1alpha1";

export async function validateCfgUpdate(req: PeprValidateRequest<ClusterConfig>) {
  try {
    validateCfg(req.Raw);
  } catch (e) {
    return req.Deny(`Validation failed: ${e.message}`);
  }
  return req.Approve();
}

export function validateCfg(cfg: ClusterConfig) {
  // Validate that the cacert is base64 encoded
  if (cfg.spec?.expose.caCert && cfg.spec.expose.caCert !== "###ZARF_VAR_CA_CERT###") {
    if (!isBase64(cfg.spec.expose.caCert)) {
      throw new Error("ClusterConfig: caCert must be base64 encoded; found invalid value");
    }
  }
}
