// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import yaml from 'js-yaml';

test('bootstrap accepts the Gateway API bundle actually shipped by the vendored chart', () => {
  const helper = fs.readFileSync(new URL('./scripts/fence.go', import.meta.url), 'utf8');
  const pin = helper.match(/gatewayAPIBundleVersion\s*=\s*"([^"]+)"/);
  assert.ok(pin, 'the bootstrap helper must declare its exact Gateway API bundle pin');
  const chart = new URL('../../src/istio/gateway-api-crds/chart/templates/gateway-api-crds.yaml', import.meta.url);
  const resources = yaml.loadAll(fs.readFileSync(chart, 'utf8'));
  const crds = resources.filter(resource => resource?.kind === 'CustomResourceDefinition'
    && ['gateway.networking.k8s.io', 'gateway.networking.x-k8s.io'].includes(resource.spec.group));
  assert.ok(crds.length > 0, 'the actual chart must contain Gateway API CRDs');
  for (const crd of crds) {
    assert.equal(crd.metadata.annotations['gateway.networking.k8s.io/bundle-version'], pin[1], crd.metadata.name);
    assert.equal(crd.metadata.annotations['gateway.networking.k8s.io/channel'], 'experimental', crd.metadata.name);
  }
});
