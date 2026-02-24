/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { PeprValidateRequest } from "pepr";
import { PrometheusProbe } from "../../operator/crd";

/**
 * Validates Prometheus Probe CRs to prevent cross-namespace exploitation of
 * SSO blackbox exporter modules.
 *
 * SSO modules in the shared blackbox exporter config are namespaced using the
 * convention `http_200x_sso_<namespace>_<clientId>`. A Probe in one namespace
 * must not reference an SSO module owned by a different namespace.
 */
export async function probeValidator(req: PeprValidateRequest<PrometheusProbe>) {
  const module = req.Raw.spec?.module;
  const namespace = req.Raw.metadata?.namespace;

  if (module?.startsWith("http_200x_sso")) {
    const expectedPrefix = `http_200x_sso_${namespace}_`;
    if (!module.startsWith(expectedPrefix)) {
      return req.Deny("Probe is not authorized to use this Blackbox Exporter module");
    }
  }

  return req.Approve();
}
