/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s, kind } from "pepr";
import { Component, setupLogger } from "../../../logger";

export const caLog = setupLogger(Component.OPERATOR_CA_BUNDLE);

/**
 * Fetches DoD and Public CA certificates from the uds-ca-certs ConfigMap
 *
 * @returns Object containing dodCACerts and publicCACerts strings, or empty strings if not found
 */
export async function fetchCACerts(): Promise<{ dodCerts: string; publicCerts: string }> {
  try {
    const caCertsConfigMap = await K8s(kind.ConfigMap)
      .InNamespace("pepr-system")
      .Get("uds-ca-certs");
    return {
      dodCerts: caCertsConfigMap.data?.["dodCACerts"] || "",
      publicCerts: caCertsConfigMap.data?.["publicCACerts"] || "",
    };
  } catch (e) {
    if (e?.status === 404) {
      caLog.debug("uds-ca-certs ConfigMap not found, proceeding with defaults");
      return { dodCerts: "", publicCerts: "" };
    } else {
      caLog.error(e, "Failed to fetch uds-ca-certs");
      throw e;
    }
  }
}
