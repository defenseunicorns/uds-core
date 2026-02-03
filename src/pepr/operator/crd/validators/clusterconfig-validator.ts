/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { X509Certificate } from "crypto";
import { PeprValidateRequest } from "pepr";
import { isBase64 } from "../../controllers/utils.js";
import { ClusterConfig } from "../generated/clusterconfig-v1alpha1.js";

export async function validateCfgUpdate(req: PeprValidateRequest<ClusterConfig>) {
  try {
    validateCfg(req.Raw);
  } catch (e) {
    return req.Deny(`Validation failed: ${e.message}`);
  }
  return req.Approve();
}

export function validateCfg(cfg: ClusterConfig) {
  // Validate that the caBundle.certs is base64 encoded and is a valid cert bundle
  if (
    cfg.spec?.caBundle?.certs &&
    cfg.spec.caBundle.certs !== "###ZARF_VAR_CA_BUNDLE_CERTS###" &&
    cfg.spec.caBundle.certs !== "###ZARF_VAR_CA_CERT###"
  ) {
    if (!isBase64(cfg.spec.caBundle.certs)) {
      throw new Error("ClusterConfig: caBundle.certs must be base64 encoded; found invalid value");
    }

    // Decode and validate certificate bundle
    const decodedCerts = Buffer.from(cfg.spec.caBundle.certs, "base64").toString("utf8");
    const certBlocks = decodedCerts.match(
      /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g,
    );

    if (!certBlocks || certBlocks.length === 0) {
      throw new Error("ClusterConfig: No valid certificates found in bundle");
    }

    // Validate each certificate in the bundle
    certBlocks.forEach((certPem, index) => {
      try {
        new X509Certificate(certPem);
      } catch (e) {
        throw new Error(
          `ClusterConfig: Invalid certificate at index ${index}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    });
  }
}
