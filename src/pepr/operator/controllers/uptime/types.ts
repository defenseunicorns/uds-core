/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

interface BlackboxHttpModule {
  prober: "http";
  timeout: string;
  http: BlackboxHttpConfig;
}

interface BlackboxHttpConfig {
  valid_http_versions: string[];
  follow_redirects?: boolean;
  preferred_ip_protocol: string;
  oauth2?: BlackboxOAuth2Config;
}

interface BlackboxOAuth2Config {
  client_id: string;
  client_secret: string;
  token_url: string;
  endpoint_params: {
    grant_type: string;
  };
}

export interface BlackboxConfig {
  modules: Record<string, BlackboxHttpModule>;
}
