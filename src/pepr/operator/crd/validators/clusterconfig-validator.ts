/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { PeprValidateRequest } from "pepr";
import { X509Certificate } from "crypto";
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
  validateExposePaths(cfg);

  // Validate that the caBundle.certs is base64 encoded and is a valid cert bundle
  if (cfg.spec?.caBundle?.certs && cfg.spec.caBundle.certs !== "###ZARF_VAR_CA_BUNDLE_CERTS###") {
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

function validateExposePaths(cfg: ClusterConfig) {
  const expose = cfg.spec?.expose;
  if (!expose) {
    return;
  }

  for (const [field, value] of Object.entries({
    contextPath: expose.contextPath,
    adminContextPath: expose.adminContextPath,
  })) {
    if (!value || value.startsWith("###ZARF_VAR_")) {
      continue;
    }
    if (!value.startsWith("/")) {
      throw new Error(`ClusterConfig: expose.${field} must start with /`);
    }
    if (value.length > 1 && value.endsWith("/")) {
      throw new Error(`ClusterConfig: expose.${field} must not end with /`);
    }
  }

  const contextPath = normalizeValidationPath(expose.contextPath);
  const adminContextPath = normalizeValidationPath(expose.adminContextPath, "/admin");
  if (contextPath && contextPath === adminContextPath) {
    throw new Error("ClusterConfig: expose.contextPath and expose.adminContextPath must not collide");
  }
}

function normalizeValidationPath(path?: string, defaultPath = ""): string {
  const rawPath = path || defaultPath;
  if (!rawPath || rawPath === "/" || rawPath.startsWith("###ZARF_VAR_")) {
    return defaultPath === "/" ? "" : defaultPath;
  }

  const withLeadingSlash = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
  return withLeadingSlash.replace(/\/+$/g, "");
}
