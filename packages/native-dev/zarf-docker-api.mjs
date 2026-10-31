// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

// The pinned Zarf Docker exporter expects one top-level OCI descriptor. Newer
// Docker platform-filtered exports flatten runtime + attestation into two.
// API1.45 preserves the original verified index and its runtime child digest.
export function zarfDockerEnvironment(apiVersion, environment) {
  if (apiVersion !== '1.45') throw new Error('Native package creation requires qualified Docker API1.45');
  return { ...environment, DOCKER_API_VERSION: apiVersion };
}
