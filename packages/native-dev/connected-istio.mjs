// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

export function connectedIstioImage(upstream, overlay) {
  for (const name of ['proxy', 'proxy_init']) {
    const source = upstream.global?.[name]?.image;
    if (typeof source !== 'string' || !source) {
      throw new Error(`Upstream Istio ${name} image is missing`);
    }
    const expected = source.replace(/^###ZARF_REGISTRY###/, 'docker.io');
    if (overlay.global?.[name]?.image !== expected) {
      throw new Error(`Connected Istio ${name} image differs from the upstream image`);
    }
  }
  return overlay.global.proxy.image;
}
