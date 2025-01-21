/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { kind } from "pepr";
import { UDSConfig } from "../../../config";
import { Component, setupLogger } from "../../../logger";
import { reconcileAuthservice } from "../keycloak/authservice/authservice";
import { Action, AuthServiceEvent } from "../keycloak/authservice/types";
import { initAPIServerCIDR } from "../network/generators/kubeAPI";
import { initAllNodesTarget } from "../network/generators/kubeNodes";

// configure subproject logger
const log = setupLogger(Component.OPERATOR_CONFIG);

export async function updateUDSConfig(config: kind.Secret) {
  log.info("Updating UDS Config from uds-operator-config secret change");

  // Base64 decode the secret data
  const decodedConfigData: { [key: string]: string } = {};
  for (const key in config.data) {
    try {
      const decodedValue = atob(config.data[key]);
      if (decodedValue) {
        decodedConfigData[key] = decodedValue;
      } else {
        decodedConfigData[key] = "";
      }
    } catch (e) {
      log.error(`Failed to decode secret key: ${key}, error: ${e.message}`);
    }
  }

  // Handle changes to the Authservice configuration
  if (
    decodedConfigData.UDS_CA_CERT !== UDSConfig.caCert ||
    decodedConfigData.AUTHSERVICE_REDIS_URI !== UDSConfig.authserviceRedisUri
  ) {
    UDSConfig.caCert = decodedConfigData.UDS_CA_CERT;
    UDSConfig.authserviceRedisUri = decodedConfigData.AUTHSERVICE_REDIS_URI;
    // Account for undefined or placeholder values (dev mode)
    if (!UDSConfig.caCert || UDSConfig.caCert === "###ZARF_VAR_CA_CERT###") {
      UDSConfig.caCert = "";
    }
    // Validate that the cacert is base64 encoded (it should be)
    if (UDSConfig.caCert) {
      try {
        atob(UDSConfig.caCert);
      } catch (e) {
        log.error(
          "Invalid CA Cert provided in uds-operator-config secret, falling back to no CA Cert",
        );
        UDSConfig.caCert = "";
      }
    }

    const authserviceUpdate: AuthServiceEvent = {
      name: "global-config-update",
      action: Action.UpdateGlobalConfig,
      // Base64 decode the CA cert before passing to the update function
      trustedCA: atob(UDSConfig.caCert),
      redisUri: UDSConfig.authserviceRedisUri,
    };
    log.debug("Updating Authservice secret based on change to CA Cert or Redis URI");
    await reconcileAuthservice(authserviceUpdate);
  }

  // Handle changes to the kubeApiCidr
  if (decodedConfigData.KUBEAPI_CIDR !== UDSConfig.kubeApiCidr) {
    UDSConfig.kubeApiCidr = decodedConfigData.KUBEAPI_CIDR;
    // This re-runs the "init" function to update netpols if necessary
    log.debug("Updating KubeAPI network policies based on change to kubeApiCidr");
    await initAPIServerCIDR();
  }

  // Handle changes to the kubeNodeCidrs
  if (decodedConfigData.KUBENODE_CIDRS !== UDSConfig.kubeNodeCidrs) {
    UDSConfig.kubeNodeCidrs = decodedConfigData.KUBENODE_CIDRS;
    // This re-runs the "init" function to update netpols if necessary
    log.debug("Updating KubeNodes network policies based on change to kubeNodeCidrs");
    await initAllNodesTarget();
  }

  if (
    decodedConfigData.UDS_DOMAIN !== UDSConfig.domain ||
    decodedConfigData.UDS_ADMIN_DOMAIN !== UDSConfig.adminDomain
  ) {
    UDSConfig.domain = decodedConfigData.UDS_DOMAIN;
    UDSConfig.adminDomain = decodedConfigData.UDS_ADMIN_DOMAIN;
    if (!UDSConfig.domain || UDSConfig.domain === "###ZARF_VAR_DOMAIN###") {
      UDSConfig.domain = "uds.dev";
    }
    if (!UDSConfig.adminDomain || UDSConfig.adminDomain === "###ZARF_VAR_ADMIN_DOMAIN###") {
      UDSConfig.adminDomain = `admin.${UDSConfig.domain}`;
    }
    // todo: Add logic to handle domain changes and update across virtualservices, authservice config, etc
  }

  // Update other config values (no need for special handling)
  UDSConfig.allowAllNSExemptions = decodedConfigData.UDS_ALLOW_ALL_NS_EXEMPTIONS === "true";

  log.info("Updated UDS Config based on uds-operator-config secret changes");
}
