/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { PeprValidateRequest } from "pepr";
import { ClusterConfig } from "../generated/clusterconfig-v1alpha1";

export async function validateCfgUpdate(req: PeprValidateRequest<ClusterConfig>) {
  try {
    validateCfg(req.Raw);
  } catch (e) {
    return req.Deny(`Failed to validate UDSConfig update: ${e}`);
  }

  return req.Approve();
}

export async function validateCfg(cfg: ClusterConfig) {
  if (cfg.metadata?.namespace !== "pepr-system" && cfg.metadata?.name !== "uds-cluster-config") {
    throw new Error("ClusterConfig Validation: namespace or name is invalid");
  }

  // Validate that the cacert is base64 encoded
  if (cfg.spec?.expose.caCert) {
    try {
      atob(cfg.spec?.expose.caCert);
    } catch (e) {
      throw new Error(
        "ClusterConfig Validation: caCert must be base64 encoded -- found invalid value",
      );
    }
  }
}
