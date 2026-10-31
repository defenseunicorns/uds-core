// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import yaml from 'js-yaml';
import { connectedIstioImage } from './connected-istio.mjs';

const read = name => yaml.load(fs.readFileSync(new URL(name, import.meta.url), 'utf8'));
const upstream = read('../../src/istio/values/upstream/istiod.yaml');
const overlay = read('./values/istiod-connected.yaml');

test('connected proxy images and recorded image match the actual upstream values', () => {
  assert.equal(connectedIstioImage(upstream, overlay), overlay.global.proxy.image);
});

test('connected image validation rejects either stale injection image and upstream drift', () => {
  for (const name of ['proxy', 'proxy_init']) {
    const stale = structuredClone(overlay);
    stale.global[name].image = 'docker.io/istio/proxyv2:stale';
    assert.throws(() => connectedIstioImage(upstream, stale), new RegExp(`Istio ${name} image differs`));
    const changed = structuredClone(upstream);
    changed.global[name].image = '###ZARF_REGISTRY###/istio/proxyv2:new-upstream';
    assert.throws(() => connectedIstioImage(changed, overlay), new RegExp(`Istio ${name} image differs`));
  }
});
