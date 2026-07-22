/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { Log } from "pepr";

export enum Component {
  STARTUP = "startup",
  OPERATOR = "operator",
  OPERATOR_KUBEVIRT = "operator.kubevirt",
}

export function setupLogger(component: Component) {
  const logger = Log.child({ component });

  let logLevel = process.env.UDS_LOG_LEVEL;
  if (!logLevel || logLevel === "###ZARF_VAR_UDS_LOG_LEVEL###") {
    logLevel = "debug";
  }

  logger.level = logLevel;

  return logger;
}
