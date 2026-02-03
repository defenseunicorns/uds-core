/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { AuthServiceEvent } from "../keycloak/authservice/types";

type AuthserviceEventHandler = (event: AuthServiceEvent) => Promise<void>;

let authserviceEventHandler: AuthserviceEventHandler | null = null;

export function setAuthserviceEventHandler(handler: AuthserviceEventHandler) {
  authserviceEventHandler = handler;
}

export async function triggerAuthserviceUpdate(event: AuthServiceEvent): Promise<void> {
  if (!authserviceEventHandler) {
    throw new Error("Authservice event handler not registered");
  }
  await authserviceEventHandler(event);
}
