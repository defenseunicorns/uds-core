/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { Client } from "../types.js";

export enum Action {
  AddClient = "AddClient",
  RemoveClient = "RemoveClient",
  UpdateGlobalConfig = "UpdateGlobalConfig",
}

export type AddOrRemoveClientEvent = AuthServiceEvent & {
  action: Action.AddClient | Action.RemoveClient;
};

export interface AuthServiceEvent {
  name: string;
  action: Action;
  client?: Client;
  redisUri?: string;
  trustedCA?: string;
}

export interface AuthserviceConfig {
  allow_unmatched_requests: boolean;
  listen_address: string;
  listen_port: string;
  log_level: string;
  default_oidc_config: OIDCConfig;
  threads: number;
  chains: Chain[];
}

interface OIDCConfig {
  skip_verify_peer_cert?: boolean;
  authorization_uri: string;
  callback_uri?: string;
  cookie_name_prefix?: string;
  token_uri: string;
  jwks_fetcher?: JWKSFetcher;
  client_id: string;
  client_secret: string;
  id_token?: Token;
  access_token?: Token;
  trusted_certificate_authority?: string;
  logout: Logout;
  absolute_session_timeout?: string;
  idle_session_timeout?: string;
  scopes: string[];
  redis_session_store_config?: { server_uri: string };
}

interface JWKSFetcher {
  jwks_uri: string;
  periodic_fetch_interval_sec: number;
  skip_verify_peer_cert?: boolean;
}

interface Token {
  preamble?: string;
  header: string;
}

interface Logout {
  path: string;
  redirect_uri: string;
}

export interface Chain {
  name: string;
  match: Match;
  filters: Filter[];
}

interface Match {
  header: string;
  prefix: string;
}

interface Filter {
  oidc_override: OIDCConfig;
}
